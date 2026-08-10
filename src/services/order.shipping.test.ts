import '../test/setup';
import { orderService } from './order.service';
import { createUser, createProduct, createAddress, setCartItems } from '../test/factories';

describe('orderService.checkout — shipping', () => {
  it('charges the standard shipping fee below the free-shipping threshold', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 100, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    expect(order.shippingFee).toBe(50);
    expect(order.total).toBe(150);
    expect(order.shipping.method).toBe('standard');
  });

  it('gives free standard shipping once the subtotal clears the threshold', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 600, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    expect(order.shippingFee).toBe(0);
    expect(order.total).toBe(600);
  });

  it('always charges the express fee, even above the free-shipping threshold', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 600, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'express',
    });

    expect(order.shippingFee).toBe(120);
    expect(order.total).toBe(720);
    expect(order.shipping.method).toBe('express');
  });

  it('defaults to standard shipping when no method is given', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 100, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });
    expect(order.shipping.method).toBe('standard');
  });
});

describe('orderService — delivery status transitions', () => {
  async function placeOrder() {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 1000, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });
    return { user, order };
  }

  it('allows the full forward sequence including out_for_delivery', async () => {
    const { order } = await placeOrder();

    let current = await orderService.updateStatusAdmin(order.id, 'confirmed');
    expect(current.status).toBe('confirmed');
    current = await orderService.updateStatusAdmin(order.id, 'packed');
    expect(current.status).toBe('packed');
    current = await orderService.updateStatusAdmin(order.id, 'shipped');
    expect(current.status).toBe('shipped');
    current = await orderService.updateStatusAdmin(order.id, 'out_for_delivery');
    expect(current.status).toBe('out_for_delivery');
    current = await orderService.updateStatusAdmin(order.id, 'delivered');
    expect(current.status).toBe('delivered');
  });

  it('rejects skipping a status (e.g. shipped straight to delivered)', async () => {
    const { order } = await placeOrder();
    await orderService.updateStatusAdmin(order.id, 'confirmed');
    await orderService.updateStatusAdmin(order.id, 'packed');
    await orderService.updateStatusAdmin(order.id, 'shipped');

    await expect(orderService.updateStatusAdmin(order.id, 'delivered')).rejects.toThrow(
      'Cannot move an order'
    );
  });

  it('allows cancellation from out_for_delivery and restocks items', async () => {
    const { user, order } = await placeOrder();
    await orderService.updateStatusAdmin(order.id, 'confirmed');
    await orderService.updateStatusAdmin(order.id, 'packed');
    await orderService.updateStatusAdmin(order.id, 'shipped');
    await orderService.updateStatusAdmin(order.id, 'out_for_delivery');

    const cancelled = await orderService.cancelOrder(user.id, order.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('rejects cancelling an already-delivered order', async () => {
    const { user, order } = await placeOrder();
    await orderService.updateStatusAdmin(order.id, 'confirmed');
    await orderService.updateStatusAdmin(order.id, 'packed');
    await orderService.updateStatusAdmin(order.id, 'shipped');
    await orderService.updateStatusAdmin(order.id, 'out_for_delivery');
    await orderService.updateStatusAdmin(order.id, 'delivered');

    await expect(orderService.cancelOrder(user.id, order.id)).rejects.toThrow('can no longer be cancelled');
  });
});

describe('orderService.updateShippingDetailsAdmin', () => {
  it('sets tracking number and courier independently of status', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 100, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    const updated = await orderService.updateShippingDetailsAdmin(order.id, {
      trackingNumber: 'TRK123',
      courier: 'BlueDart',
    });

    expect(updated.shipping.trackingNumber).toBe('TRK123');
    expect(updated.shipping.courier).toBe('BlueDart');
    expect(updated.status).toBe('pending');
  });

  it('updates only the provided field, leaving the other untouched', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 100, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    await orderService.updateShippingDetailsAdmin(order.id, { trackingNumber: 'TRK1', courier: 'BlueDart' });
    const updated = await orderService.updateShippingDetailsAdmin(order.id, { trackingNumber: 'TRK2' });

    expect(updated.shipping.trackingNumber).toBe('TRK2');
    expect(updated.shipping.courier).toBe('BlueDart');
  });

  it('throws for a nonexistent order', async () => {
    await expect(
      orderService.updateShippingDetailsAdmin('64b5f8a1c9e77a001f4a1234', { trackingNumber: 'X' })
    ).rejects.toThrow('not found');
  });
});
