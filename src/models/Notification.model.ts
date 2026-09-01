import { Schema, model, Document, Model, Types } from 'mongoose';

export type NotificationType = 'ORDER' | 'PAYMENT' | 'SHIPPING' | 'ACCOUNT' | 'PROMOTION' | 'SYSTEM';

export interface INotification extends Document {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  /** Frontend route to navigate to when the notification is clicked, e.g. "/orders/:id". */
  link?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationModel extends Model<INotification> {}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['ORDER', 'PAYMENT', 'SHIPPING', 'ACCOUNT', 'PROMOTION', 'SYSTEM'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    link: { type: String, trim: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Every list/unread-count query is scoped to a user, newest first.
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

export const Notification = model<INotification, INotificationModel>('Notification', notificationSchema);
