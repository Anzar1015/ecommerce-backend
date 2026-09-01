import { User, IUser, UserRole } from '../models/User.model';

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the User collection. Services depend on this abstraction so
 * the data layer (e.g. swapping Mongo for another store) can change
 * without touching business logic.
 */
export const userRepository = {
  async findByEmail(email: string, withPassword = false): Promise<IUser | null> {
    const query = User.findOne({ email });
    if (withPassword) query.select('+password');
    return query.exec();
  },

  async findById(id: string, withRefreshTokens = false): Promise<IUser | null> {
    const query = User.findById(id);
    if (withRefreshTokens) query.select('+refreshTokens');
    return query.exec();
  },

  async findByResetToken(hashedToken: string): Promise<IUser | null> {
    return User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    })
      .select('+passwordResetToken +passwordResetExpires +password')
      .exec();
  },

  async create(data: { name: string; email: string; password: string }): Promise<IUser> {
    return User.create(data);
  },

  async addRefreshToken(userId: string, token: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $addToSet: { refreshTokens: token } });
  },

  async removeRefreshToken(userId: string, token: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $pull: { refreshTokens: token } });
  },

  async findByRefreshToken(token: string): Promise<IUser | null> {
    return User.findOne({ refreshTokens: token }).select('+refreshTokens').exec();
  },

  async clearAllRefreshTokens(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $set: { refreshTokens: [] } });
  },

  async countByRole(role: UserRole): Promise<number> {
    return User.countDocuments({ role }).exec();
  },

  /** Ids only — used for bulk operations like the new-promotion notification fan-out. */
  async findIdsByRole(role: UserRole): Promise<string[]> {
    const users = await User.find({ role }).select('_id').lean().exec();
    return users.map((user) => user._id.toString());
  },

  async countByRoleSince(role: UserRole, since: Date): Promise<number> {
    return User.countDocuments({ role, createdAt: { $gte: since } }).exec();
  },
};
