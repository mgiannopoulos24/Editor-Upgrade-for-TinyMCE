/** wp-env's default admin account. */
export const credentials = {
	username: process.env.WP_USERNAME ?? 'admin',
	password: process.env.WP_PASSWORD ?? 'password',
};
