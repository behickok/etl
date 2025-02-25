export async function handle({ event, resolve }) {
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => !name.startsWith('x-')
	});

	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

	return response;
}
