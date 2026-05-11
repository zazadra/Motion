const str = 'VIk6zJiS1TIZKOpB_1nvCzMVJ6oP2U62gy4JDSUdhk4BAQADAA';
const b = Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
console.log('Length:', b.length);
console.log('Hex:', b.toString('hex'));
