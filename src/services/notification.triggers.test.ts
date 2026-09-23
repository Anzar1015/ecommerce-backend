import '../test/setup';
import { orderService } from './order.service';
import { authService } from './auth.service';
import { couponService } from './coupon.service';
import { notificationService } from './notification.service';
import { createUser, createProduct, createAddress, setCartItems } from '../test/factories';

describe('Order lifecycle notifications (spec 15.3)', () => {
  it('notifies the customer with type ORDER when an order is placed', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 500, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

    await orderService.checkout(user.id, { addressId: address.id, paymentMethod: 'cod', shippingMethod: 'standard' });

    const result = await notificationService.listForUser(user.id, { type: 'ORDER' }, 1, 10);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].title).toBe('Order Placed');
  });

  it('notifies with type SHIPPING (not ORDER) when the order ships', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 500, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    await orderService.updateStatusAdmin(order.id, 'confirmed');
    await orderService.updateStatusAdmin(order.id, 'packed');
    await orderService.updateStatusAdmin(order.id, 'shipped');

    const shipping = await notificationService.listForUser(user.id, { type: 'SHIPPING' }, 1, 10);
    expect(shipping.notifications.map((n) => n.title)).toContain('Order Shipped');
  });

  it('notifies with type ORDER when the order is cancelled', async () => {
    const user = await createUser();
    const address = await createAddress(user.id);
    const product = await createProduct({ price: 500, stock: 5 });
    await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
    const order = await orderService.checkout(user.id, {
      addressId: address.id,
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    });

    await orderService.cancelOrder(user.id, order.id);

    const result = await notificationService.listForUser(user.id, { type: 'ORDER' }, 1, 10);
    expect(result.notifications.map((n) => n.title)).toContain('Order Cancelled');
  });
});

describe('Account notifications (spec 15.3)', () => {
  it('sends a welcome notification on registration', async () => {
    const { user } = await authService.register({
      name: 'New User',
      email: 'new-user@example.com',
      password: 'Password123!',
    });

    const result = await notificationService.listForUser(user.id, { type: 'ACCOUNT' }, 1, 10);
    expect(result.notifications.map((n) => n.title)).toContain('Welcome to Cartify!');
  });

  it('sends a password-changed notification on reset', async () => {
    const user = await createUser();
    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    await authService.resetPassword(rawToken, 'NewPassword123!');

    const result = await notificationService.listForUser(user.id, { type: 'ACCOUNT' }, 1, 10);
    expect(result.notifications.map((n) => n.title)).toContain('Password Changed');
  });
});

describe('Promotion notifications (spec 15.3)', () => {
  it('notifies every customer when an active coupon is created', async () => {
    const admin = await createUser({ role: 'admin' });
    const customerA = await createUser();
    const customerB = await createUser();

    await couponService.create(
      {
        code: 'PROMO10',
        type: 'PERCENTAGE',
        value: 10,
        minimumOrderAmount: 0,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 86400000),
        firstOrderOnly: false,
        isActive: true,
        applicableProducts: [],
        applicableCategories: [],
        excludedProducts: [],
      },
      admin.id
    );

    const resultA = await notificationService.listForUser(customerA.id, { type: 'PROMOTION' }, 1, 10);
    const resultB = await notificationService.listForUser(customerB.id, { type: 'PROMOTION' }, 1, 10);
    expect(resultA.notifications).toHaveLength(1);
    expect(resultB.notifications).toHaveLength(1);
    expect(resultA.notifications[0].message).toContain('PROMO10');
  });

  it('does not notify anyone when the coupon is created inactive', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();

    await couponService.create(
      {
        code: 'DRAFT10',
        type: 'PERCENTAGE',
        value: 10,
        minimumOrderAmount: 0,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 86400000),
        firstOrderOnly: false,
        isActive: false,
        applicableProducts: [],
        applicableCategories: [],
        excludedProducts: [],
      },
      admin.id
    );

    const result = await notificationService.listForUser(customer.id, { type: 'PROMOTION' }, 1, 10);
    expect(result.notifications).toHaveLength(0);
  });

  it('does not notify anyone when the coupon starts in the future', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();

    await couponService.create(
      {
        code: 'FUTURE10',
        type: 'PERCENTAGE',
        value: 10,
        minimumOrderAmount: 0,
        startDate: new Date(Date.now() + 86400000),
        endDate: new Date(Date.now() + 2 * 86400000),
        firstOrderOnly: false,
        isActive: true,
        applicableProducts: [],
        applicableCategories: [],
        excludedProducts: [],
      },
      admin.id
    );

    const result = await notificationService.listForUser(customer.id, { type: 'PROMOTION' }, 1, 10);
    expect(result.notifications).toHaveLength(0);
  });
});
