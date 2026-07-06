import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const accountId = process.env['R2_ACCOUNT_ID']
const accessKeyId = process.env['R2_ACCESS_KEY_ID']
const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY']
const bucket = process.env['R2_BUCKET']

/** True when R2 credentials are configured; attachment features require this. */
export const isR2Configured = !!(accountId && accessKeyId && secretAccessKey && bucket)

let client: S3Client | null = null
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    })
  }
  return client
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  )
}

export async function presignDownload(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}
