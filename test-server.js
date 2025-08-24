import dotenv from 'dotenv';
import next from 'next';

console.log('Starting test server...');

dotenv.config({ path: '.env.local' });
console.log('Environment loaded');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

console.log('Creating Next.js app...');
const app = next({ dev, hostname, port });
console.log('Next.js app created');

console.log('Preparing app...');
app.prepare().then(() => {
  console.log('✅ App prepared successfully!');
  console.log('Server should be running on http://localhost:3000');
}).catch(err => {
  console.error('❌ Error preparing app:', err);
});

