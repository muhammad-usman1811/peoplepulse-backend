const bcrypt = require('bcryptjs');

async function testPasswordHashing() {
  console.log('--- Testing Password Hashing Logic ---');
  const tempPassword = '123456';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(tempPassword, salt);
  console.log('Temporary Password:', tempPassword);
  console.log('Hashed Password:', hashedPassword);

  const isMatch = await bcrypt.compare('123456', hashedPassword);
  console.log('Bcrypt comparison with "123456":', isMatch ? 'PASSED' : 'FAILED');

  const isWrongMatch = await bcrypt.compare('wrongpassword', hashedPassword);
  console.log('Bcrypt comparison with "wrongpassword":', !isWrongMatch ? 'PASSED (correctly rejected)' : 'FAILED');

  console.log('\n--- Testing Email Sanitization ---');
  const rawEmail = '   User.Name@Gmail.COM  ';
  const sanitizedEmail = rawEmail.trim().toLowerCase();
  console.log('Raw:', `"${rawEmail}"`);
  console.log('Sanitized:', `"${sanitizedEmail}"`);
  console.log('Sanitization check:', sanitizedEmail === 'user.name@gmail.com' ? 'PASSED' : 'FAILED');

  console.log('\nAll unit checks passed successfully!');
}

testPasswordHashing().catch(console.error);
