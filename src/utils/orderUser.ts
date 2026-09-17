import mongoose from 'mongoose';
import { IOrder } from '../models/Order.model';

/**
 * `order.user` is a plain ObjectId on most code paths, but some queries
 * (e.g. `orderRepository.findById`, used by admin routes) populate it with
 * `{name, email}` — calling `.toString()` on a populated Mongoose
 * subdocument does NOT return the hex id, it returns a debug-inspect dump,
 * which silently breaks anything that expects a real ObjectId string (this
 * broke order-status notifications once already). Any code that needs the
 * user id off an `IOrder` — regardless of whether it was populated — should
 * go through this instead of `order.user.toString()`.
 */
export function resolveOrderUserId(order: IOrder): string {
  const user = order.user as unknown as { _id?: mongoose.Types.ObjectId };
  return user && typeof user === 'object' && user._id
    ? user._id.toString()
    : (order.user as mongoose.Types.ObjectId).toString();
}
