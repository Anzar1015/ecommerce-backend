import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IAddress extends Document {
  user: Types.ObjectId;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAddressModel extends Model<IAddress> {}

const addressSchema = new Schema<IAddress>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: 20,
    },
    addressLine1: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: 200,
    },
    addressLine2: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: 100,
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      maxlength: 20,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: 100,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
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

addressSchema.index({ user: 1 });

export const Address = model<IAddress, IAddressModel>('Address', addressSchema);
