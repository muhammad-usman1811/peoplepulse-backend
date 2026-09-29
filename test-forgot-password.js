const assert = require('assert/strict');
const bcrypt = require('bcryptjs');

async function testPasswordHashing() {
  const testPassword = 'unit-test-password';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(testPassword, salt);
  assert.equal(await bcrypt.compare(testPassword, hashedPassword), true);
  assert.equal(await bcrypt.compare('different-unit-test-password', hashedPassword), false);

  const rawEmail = '   User.Name@Gmail.COM  ';
  const sanitizedEmail = rawEmail.trim().toLowerCase();
  assert.equal(sanitizedEmail, 'user.name@gmail.com');
  console.log('Password hashing and email normalization checks passed.');
}

testPasswordHashing().catch((error) => {
  console.error('Password hashing checks failed:', error.message);
  process.exitCode = 1;
});
