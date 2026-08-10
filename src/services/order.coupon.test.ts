import '../test/setup';
import { orderService } from './order.service';
import { couponRepository } from '../repositories/coupon.repository';
import { Product } from '../models/Product.model';
import { createUser, createProduct, createAddress, createCoupon, setCartItems } from '../test/factories';

describe('orderService.checkout — coupon integration', () => {
  it('applies a valid coupon discount to the order total and snapshots it', async () => {
    const user = await createUser();
    const admin = await createUser({ role: 'admin' });
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 1000, stock: 10 });
    await setCartItems(user.id, [{ product: product.id, quantity: 2 }]);
    const coupon = await createCoupon({ createdBy: admin.id, type: 'PERCENTAGE', value: 10 });

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
      couponCode: coupon.code,
    });

    expect(order.subtotal).toBe(2000);
    expect(order.discount).toBe(200);
    expect(order.total).toBe(1800);
    expect(order.coupon?.code).toBe(coupon.code);

    const updatedCoupon = await couponRepository.findById(coupon.id);
    expect(updatedCoupon?.usedCount).toBe(1);
  });

  it('rejects checkout with an invalid coupon code and leaves stock untouched', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 1000, stock: 10 });
    await setCartItems(user.id, [{ product: product.id, quantity: 2 }]);

    await expect(
      orderService.checkout(user.id, {
        addressId: address.id,
        paymentMethod: 'cod',
        shippingMethod: 'standard',
        couponCode: 'NOPE',
      })
    ).rejects.toThrow('Invalid coupon code');

    const unchangedProduct = await Product.findById(product.id).exec();
    expect(unchangedProduct?.stock).toBe(10);
  });

  it('checks out without a coupon exactly as before (discount 0)', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 500, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    expect(order.discount).toBe(0);
    expect(order.total).toBe(500);
    expect(order.coupon).toBeUndefined();
  });

  it('restores coupon usage and stock when a coupon-discounted order is cancelled', async () => {
    const user = await createUser();
    const admin = await createUser({ role: 'admin' });
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 1000, stock: 10 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const coupon = await createCoupon({ createdBy: admin.id, type: 'FIXED_AMOUNT', value: 100 });

    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
      couponCode: coupon.code,
    });

    let updatedCoupon = await couponRepository.findById(coupon.id);
    expect(updatedCoupon?.usedCount).toBe(1);
    let updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.stock).toBe(9);

    await orderService.cancelOrder(user.id, order.id);

    updatedCoupon = await couponRepository.findById(coupon.id);
    expect(updatedCoupon?.usedCount).toBe(0);
    updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.stock).toBe(10);
  });

  it('rejects a coupon whose minimum order amount the cart does not meet', async () => {
    const user = await createUser();
    const admin = await createUser({ role: 'admin' });
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 100, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const coupon = await createCoupon({ createdBy: admin.id, minimumOrderAmount: 5000 });

    await expect(
      orderService.checkout(user.id, {
        addressId: address.id,
        paymentMethod: 'cod',
        shippingMethod: 'standard',
        couponCode: coupon.code,
      })
    ).rejects.toThrow('minimum');
  });
});
