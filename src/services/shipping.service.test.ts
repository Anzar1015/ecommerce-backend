import { shippingService } from './shipping.service';

describe('shippingService', () => {
  it('lists both shipping methods with labels, ETAs and base fees', () => {
    const methods = shippingService.listMethods();
    expect(methods).toHaveLength(2);
    expect(methods.map((m) => m.method).sort()).toEqual(['express', 'standard']);
  });

  it('charges the standard base fee below the free-shipping threshold', () => {
    expect(shippingService.calculateFee('standard', 100)).toBe(50);
    expect(shippingService.calculateFee('standard', 499)).toBe(50);
  });

  it('gives free standard shipping at/above the threshold', () => {
    expect(shippingService.calculateFee('standard', 500)).toBe(0);
    expect(shippingService.calculateFee('standard', 10000)).toBe(0);
  });

  it('always charges the express fee regardless of order size', () => {
    expect(shippingService.calculateFee('express', 100)).toBe(120);
    expect(shippingService.calculateFee('express', 10000)).toBe(120);
  });

  it('exposes the free-shipping threshold', () => {
    expect(shippingService.getFreeShippingThreshold()).toBe(500);
  });
});
