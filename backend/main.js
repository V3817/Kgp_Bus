import bcrypt from 'bcrypt';
async function hashPassword() {
	let a = "driver_pw_123"
	const hashedPassword = await bcrypt.hash(a, 10);
	console.log(hashedPassword);
}

hashPassword();