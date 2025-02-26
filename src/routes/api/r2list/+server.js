// src/routes/api/listFiles/+server.js
import { json } from '@sveltejs/kit';
import AWS from 'aws-sdk';
import { PRIVATE_AWS_ACCESS_KEY_ID, PRIVATE_AWS_ENDPOINT_URL, PRIVATE_AWS_SECRET_ACCESS_KEY } from '$env/static/private';

export async function GET() {
	try {
		// Configure AWS SDK for Cloudflare R2.
		const s3 = new AWS.S3({
			endpoint: PRIVATE_AWS_ENDPOINT_URL,
			accessKeyId: PRIVATE_AWS_ACCESS_KEY_ID,
			secretAccessKey: PRIVATE_AWS_SECRET_ACCESS_KEY,
			region: 'auto', // use 'auto' for Cloudflare R2
			signatureVersion: 'v4'
		});

		// List objects in the bucket "stratum"
		const params = {
			Bucket: 'stratum' // your R2 bucket name
		};

		const result = await s3.listObjectsV2(params).promise();

		// Map over the results to extract file details.
		const files = result.Contents?.map((object) => ({
			key: object.Key,
			lastModified: object.LastModified,
			size: object.Size,
			etag: object.ETag
		})) || [];

		return json({ files });
	} catch (error) {
		console.error('List files error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
