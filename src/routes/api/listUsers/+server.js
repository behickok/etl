import { json } from '@sveltejs/kit';
import { PRIVATE_USERBASE_ADMIN_TOKEN } from '$env/static/private';
import { PUBLIC_USERBASE_APP } from '$env/static/public';
/**
 * GET /api/listUsers
 * Calls the Userbase admin API and returns a list of users.
 */
export async function GET() {
	try {
        const url=`https://v1.userbase.com/v1/admin/apps/${PUBLIC_USERBASE_APP}/users`
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${PRIVATE_USERBASE_ADMIN_TOKEN}`
			}
		});

		const data = await response.json();

		// Assume the response has a "users" field containing an array of user objects.
		return json({ users: data.users || [] });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
