import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { inventoryService } from './inventory.service';
import { IOrder } from '../models/Order.model';
import { RevenueSummary, OrderStatusCounts } from '../repositories/order.repository';
import { ProductStatusCounts, InventorySummary } from '../repositories/product.repository';

export interface DashboardSummary {
  revenue: RevenueSummary;
  orders: { total: number; byStatus: OrderStatusCounts };
  products: ProductStatusCounts;
  customers: { total: number; newThisMonth: number };
  inventory: InventorySummary;
  recentOrders: IOrder[];
}

const RECENT_ORDERS_LIMIT = 8;

export const dashboardService = {
  async getSummary(): Promise<DashboardSummary> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revenue, orderStatusCounts, productStatusCounts, totalCustomers, newCustomers, inventory, recentOrders] =
      await Promise.all([
        orderRepository.getRevenueSummary(startOfToday, startOfMonth),
        orderRepository.countByStatusAll(),
        productRepository.getStatusSummary(),
        userRepository.countByRole('customer'),
        userRepository.countByRoleSince('customer', startOfMonth),
        inventoryService.getSummary(),
        orderRepository.findRecent(RECENT_ORDERS_LIMIT),
      ]);

    const totalOrders = Object.values(orderStatusCounts).reduce((sum, count) => sum + count, 0);

    return {
      revenue,
      orders: { total: totalOrders, byStatus: orderStatusCounts },
      products: productStatusCounts,
      customers: { total: totalCustomers, newThisMonth: newCustomers },
      inventory,
      recentOrders,
    };
  },
};
