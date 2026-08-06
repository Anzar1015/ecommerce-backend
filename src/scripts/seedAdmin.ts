import { connectDB, disconnectDB } from '../config/db';
import { userRepository } from '../repositories/user.repository';
// Scripts sit outside the request-handling layers (controllers/services/repositories),
// so unlike the rest of the app it's fine to touch the model directly here.
import { User } from '../models/User.model';
import { logger } from '../utils/logger';

interface SeedAdminInput {
  email: string;
  password: string;
  name: string;
}

function parseArgs(): SeedAdminInput {
  const flag = (name: string): string | undefined => {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : undefined;
  };

  const email = flag('email') ?? process.env.ADMIN_EMAIL;
  const password = flag('password') ?? process.env.ADMIN_PASSWORD;
  const name = flag('name') ?? process.env.ADMIN_NAME ?? 'Admin';

  if (!email || !password) {
    console.error(
      'Usage: npm run seed:admin -- --email=admin@example.com --password=SecurePass123 [--name="Admin User"]\n' +
        '(or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME env vars)'
    );
    process.exit(1);
  }

  return { email, password, name };
}

async function seedAdmin({ email, password, name }: SeedAdminInput): Promise<void> {
  await connectDB();

  const existing = await userRepository.findByEmail(email);

  if (existing) {
    if (existing.role === 'admin') {
      logger.info('User is already an admin', { userId: existing.id, email });
    } else {
      existing.role = 'admin';
      await existing.save();
      logger.info('Promoted existing user to admin', { userId: existing.id, email });
    }
  } else {
    const user = await User.create({ name, email, password, role: 'admin' });
    logger.info('Created new admin user', { userId: user.id, email });
  }

  await disconnectDB();
}

seedAdmin(parseArgs())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed admin user:', error);
    process.exit(1);
  });
