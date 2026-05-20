#!/usr/bin/env node

/**
 * Mint pre-signed PUT URLs for R2 uploads. Runs inside the
 * mint-upload-urls.yml GitHub Action (where R2 creds are in env).
 *
 * Input: env var SPEC containing a JSON array of
 *   [{ logical, sha, filename }]
 * where logical = "/assets/projects/foo/bar.png" (the path the manifest
 * will key on), sha = local SHA-256 hex (content hash), filename = the
 * basename to use in the R2 key (so download dialogs get a meaningful
 * name instead of just the hash).
 *
 * Output (to stdout): JSON array of
 *   [{ logical, url }]
 * one entry per input. The Action uploads this as an artifact for the
 * local upload.js CLI to read.
 *
 * URLs expire in 10 minutes — enough for a curl upload, short enough
 * that a stale leak isn't useful.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function requireEnv(name) {
    if (!process.env[name]) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return process.env[name];
}

const BUCKET = process.env.R2_BUCKET || 'agenticlearning-assets';

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
});

function contentType(filename) {
    const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
    return {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        webp: 'image/webp',
        mp4: 'video/mp4',
        css: 'text/css',
        csv: 'text/csv',
    }[ext] || 'application/octet-stream';
}

async function main() {
    const spec = JSON.parse(requireEnv('SPEC'));
    if (!Array.isArray(spec)) {
        console.error('SPEC must be a JSON array');
        process.exit(1);
    }
    const out = [];
    for (const { logical, sha, filename } of spec) {
        if (!logical || !sha || !filename) {
            console.error(`Bad spec entry: ${JSON.stringify({ logical, sha, filename })}`);
            process.exit(1);
        }
        const r2Key = `${sha.slice(0, 16)}/${filename}`;
        const ct = contentType(filename);
        const cmd = new PutObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
            ContentType: ct,
        });
        const url = await getSignedUrl(s3, cmd, { expiresIn: 600 });
        // The pre-signed URL's SigV4 canonical request includes
        // `Content-Type` when set on PutObjectCommand. The client MUST
        // echo a matching `Content-Type` header on the PUT or R2
        // returns 403 SignatureDoesNotMatch. We emit `contentType` so
        // upload.js can pass `-H "Content-Type: ..."` on curl.
        out.push({ logical, url, r2Key, contentType: ct });
    }
    process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
