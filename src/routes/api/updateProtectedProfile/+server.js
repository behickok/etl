import { json } from '@sveltejs/kit';
import { PRIVATE_USERBASE_ADMIN_TOKEN } from '$env/static/private';

/**
 * POST /api/updateProtectedProfile
 * Body example: { username: "user1", client: "bucket123", role: "Admin" }
 * 
 * This endpoint updates a user's protected profile using the admin token stored in PRIVATE_USERBASE_ADMIN_TOKEN.
 * All fields besides "username" in the request body are passed as the protectedProfile.
 */
export async function POST({ request }) {
	try {
		const payload = await request.json();
		const { username, ...profileFields } = payload;
		if (!username) {
			return json({ error: 'Missing username' }, { status: 400 });
		}

		// Call Userbase admin endpoint with our private token
		const response = await fetch(`https://v1.userbase.com/v1/admin/users/${username}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${PRIVATE_USERBASE_ADMIN_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				protectedProfile: profileFields
			})
		});

		let data = {};
		try {
			data = await response.json();
		} catch (_) {
			// If response is not JSON, ignore
		}

		if (!response.ok) {
			const msg = data?.message || 'Error updating protected profile';
			return json({ error: msg }, { status: response.status });
		}

		return json({ success: true, message: 'Protected profile updated successfully.' });
	} catch (err) {
		return json({ error: err.message }, { status: 500 });
	}
}
