import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { makePasswordHash } from '../server/auth.mjs';

function hidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return reject(new Error('Run this command in a terminal window so the password can be hidden.'));
    stdout.write(prompt);
    let value = '';
    const onData = chunk => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') { stdin.setRawMode(false); stdin.pause(); reject(new Error('Cancelled.')); return; }
        if (character === '\r' || character === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData); stdout.write('\n'); resolve(value); return; }
        if (character === '\u0008' || character === '\u007f') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
  });
}

const terminal = createInterface({ input: stdin, output: stdout });
try {
  const email = (await terminal.question('Receptionist email: ')).trim();
  terminal.close();
  const password = await hidden('Choose a password (12+ characters; input hidden): ');
  const repeated = await hidden('Type it again: ');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 12) throw new Error('Choose a password with at least 12 characters.');
  if (password !== repeated) throw new Error('The passwords did not match. Run the command again.');
  console.log('\nAdd these lines to the server environment. Keep the hash private and do not commit it to a public repository:');
  console.log(`RECEPTIONIST_EMAIL=${email}`);
  console.log(`RECEPTIONIST_PASSWORD_HASH=${makePasswordHash(password)}`);
} catch (error) {
  terminal.close();
  console.error(error.message);
  process.exitCode = 1;
}
