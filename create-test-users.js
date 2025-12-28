import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
  console.error('❌ CLERK_SECRET_KEY is not set in .env file');
  process.exit(1);
}

const CLERK_API_URL = 'https://api.clerk.com/v1';

// Test users to create
const testUsers = [
  { email: 'user1@gmail.com', password: 'TestPass123!@#' },
  { email: 'user2@gmail.com', password: 'TestPass123!@#' },
  { email: 'user3@gmail.com', password: 'TestPass123!@#' },
  { email: 'user4@gmail.com', password: 'TestPass123!@#' },
];

async function createUser(email, password) {
  try {
    const response = await fetch(`${CLERK_API_URL}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: [email],
        password: password,
        skip_password_checks: true,
        skip_password_requirement: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create user ${email}: ${JSON.stringify(errorData)}`);
    }

    const userData = await response.json();
    console.log(`✅ Created user: ${email} (ID: ${userData.id})`);
    return userData;
  } catch (error) {
    console.error(`❌ Error creating user ${email}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Creating test users...\n');

  for (const user of testUsers) {
    try {
      await createUser(user.email, user.password);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Continue with next user even if one fails
      console.error(error.message);
    }
  }

  console.log('\n✨ Done! Test users created.');
  console.log('\nYou can now sign in with:');
  testUsers.forEach(user => {
    console.log(`  - ${user.email} / ${user.password}`);
  });
}

main().catch(console.error);

