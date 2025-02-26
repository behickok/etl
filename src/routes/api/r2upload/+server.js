// src/routes/api/uploadToR2/+server.js
import { json } from '@sveltejs/kit';
import AWS from 'aws-sdk';
import { PRIVATE_AWS_ACCESS_KEY_ID, PRIVATE_AWS_ENDPOINT_URL, PRIVATE_AWS_SECRET_ACCESS_KEY } from '$env/static/private';

export async function POST({ request }) {
	try {
		// Parse the form data.
		const formData = await request.formData();
		const destinationPath = formData.get('destinationPath');
		const file = formData.get('file'); // this is a File instance
		const client = formData.get('client'); // expected to be passed in the form

		if (!file || !destinationPath || !client) {
			return json({ error: 'File, destinationPath, and client are required.' }, { status: 400 });
		}

		// Convert the file to a Buffer.
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Configure AWS SDK for Cloudflare R2.
		const s3 = new AWS.S3({
			endpoint: PRIVATE_AWS_ENDPOINT_URL, // update with your R2 endpoint
			accessKeyId: PRIVATE_AWS_ACCESS_KEY_ID,
			secretAccessKey: PRIVATE_AWS_SECRET_ACCESS_KEY,
			region: 'auto', // use 'auto' for Cloudflare R2
			signatureVersion: 'v4'
		});

		const params = {
			Bucket: client, // use the client value from form data as the bucket name
			Key: destinationPath,
			Body: buffer,
			ContentType: file.type || 'text/csv'
		};

		// Upload the file to R2.
		await s3.putObject(params).promise();

		return json({ success: true, destinationPath });
	} catch (error) {
		console.error('Upload error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
