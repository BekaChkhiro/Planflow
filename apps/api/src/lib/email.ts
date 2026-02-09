/**
 * Resend Email Service
 *
 * Sends email notifications for PlanFlow events.
 * API Docs: https://resend.com/docs
 */

import { Resend } from 'resend'

// Lazy-initialized Resend client
let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  if (resendClient) return resendClient

  const apiKey = process.env['RESEND_API_KEY']
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not configured - email notifications disabled')
    return null
  }

  resendClient = new Resend(apiKey)
  return resendClient
}

// ============================================
// Types
// ============================================

export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'unassignment'
  | 'comment'
  | 'comment_reply'
  | 'status_change'
  | 'task_created'
  | 'task_deleted'
  | 'invitation'
  | 'member_joined'
  | 'member_removed'
  | 'role_changed'

export interface EmailNotificationOptions {
  to: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  projectName?: string
  organizationName?: string
  actorName?: string
  taskId?: string
}

export interface TeamInvitationEmailOptions {
  to: string
  inviterName: string
  organizationName: string
  role: string
  inviteLink: string
  expiresAt: Date
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ============================================
// Configuration
// ============================================

const FROM_EMAIL = process.env['RESEND_FROM_EMAIL'] || 'PlanFlow <notifications@planflow.tools>'
const APP_URL = process.env['APP_URL'] || 'https://planflow.tools'

// ============================================
// Email Templates
// ============================================

function getNotificationSubject(type: NotificationType, title: string): string {
  const subjectPrefixes: Record<NotificationType, string> = {
    mention: '📣 ',
    assignment: '📋 ',
    unassignment: '📋 ',
    comment: '💬 ',
    comment_reply: '↩️ ',
    status_change: '🔄 ',
    task_created: '✨ ',
    task_deleted: '🗑️ ',
    invitation: '👋 ',
    member_joined: '🎉 ',
    member_removed: '👋 ',
    role_changed: '🔑 ',
  }

  return `${subjectPrefixes[type] || ''}${title}`
}

function generateNotificationHtml(options: EmailNotificationOptions): string {
  const { type, title, body, link, projectName, actorName, taskId } = options

  const actionButton = link
    ? `
      <tr>
        <td style="padding: 24px 0;">
          <a href="${link}"
             style="display: inline-block; background-color: #6366f1; color: #ffffff;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500;">
            View Details
          </a>
        </td>
      </tr>
    `
    : ''

  const contextInfo = []
  if (projectName) contextInfo.push(`<strong>Project:</strong> ${escapeHtml(projectName)}`)
  if (taskId) contextInfo.push(`<strong>Task:</strong> ${escapeHtml(taskId)}`)
  if (actorName) contextInfo.push(`<strong>By:</strong> ${escapeHtml(actorName)}`)

  const contextSection =
    contextInfo.length > 0
      ? `
      <tr>
        <td style="padding: 16px 0; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            ${contextInfo.join(' &bull; ')}
          </p>
        </td>
      </tr>
    `
      : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #6366f1; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                PlanFlow
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                ${escapeHtml(title)}
              </h2>

              ${body ? `<p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">${escapeHtml(body)}</p>` : ''}

              ${actionButton}
              ${contextSection}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                You're receiving this because you have notifications enabled.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                <a href="${APP_URL}/settings/notifications" style="color: #6366f1; text-decoration: none;">
                  Manage notification preferences
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

function generateInvitationHtml(options: TeamInvitationEmailOptions): string {
  const { inviterName, organizationName, role, inviteLink, expiresAt } = options

  const expiresDate = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to join ${escapeHtml(organizationName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #6366f1; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                PlanFlow
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                You're invited to join ${escapeHtml(organizationName)}
              </h2>

              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(inviterName)}</strong> has invited you to join their team on PlanFlow as an <strong>${escapeHtml(role)}</strong>.
              </p>

              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                PlanFlow is an AI-native project management tool that helps development teams stay organized and productive.
              </p>

              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="padding: 24px 0; text-align: center;">
                    <a href="${inviteLink}"
                       style="display: inline-block; background-color: #6366f1; color: #ffffff;
                              padding: 14px 32px; text-decoration: none; border-radius: 6px;
                              font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; text-align: center;">
                This invitation expires on ${expiresDate}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                If you don't want to join, you can ignore this email.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Button not working? Copy and paste this link:
                <a href="${inviteLink}" style="color: #6366f1; word-break: break-all;">
                  ${inviteLink}
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

// ============================================
// Helper Functions
// ============================================

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char)
}

// ============================================
// Public API
// ============================================

/**
 * Sends an email notification to a user.
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param options - Notification email options
 * @returns Result with success status and optional message ID
 */
export async function sendNotificationEmail(options: EmailNotificationOptions): Promise<EmailResult> {
  const resend = getResendClient()

  if (!resend) {
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const subject = getNotificationSubject(options.type, options.title)
    const html = generateNotificationHtml(options)

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject,
      html,
    })

    if (error) {
      console.error('Failed to send notification email:', error)
      return { success: false, error: error.message }
    }

    console.log(`Notification email sent to ${options.to}: ${data?.id}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to send notification email:', message)
    return { success: false, error: message }
  }
}

/**
 * Sends a team invitation email.
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param options - Invitation email options
 * @returns Result with success status and optional message ID
 */
export async function sendTeamInvitationEmail(options: TeamInvitationEmailOptions): Promise<EmailResult> {
  const resend = getResendClient()

  if (!resend) {
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const subject = `👋 ${options.inviterName} invited you to join ${options.organizationName} on PlanFlow`
    const html = generateInvitationHtml(options)

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject,
      html,
    })

    if (error) {
      console.error('Failed to send invitation email:', error)
      return { success: false, error: error.message }
    }

    console.log(`Invitation email sent to ${options.to}: ${data?.id}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to send invitation email:', message)
    return { success: false, error: message }
  }
}

/**
 * Sends a password reset email.
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param to - Recipient email address
 * @param resetLink - Password reset link
 * @param expiresAt - When the reset link expires
 * @returns Result with success status
 */
export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  expiresAt: Date
): Promise<EmailResult> {
  const resend = getResendClient()

  if (!resend) {
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const expiresDate = new Date(expiresAt).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your PlanFlow password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #6366f1; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">PlanFlow</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                Reset your password
              </h2>
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to choose a new password.
              </p>
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="padding: 24px 0; text-align: center;">
                    <a href="${resetLink}"
                       style="display: inline-block; background-color: #6366f1; color: #ffffff;
                              padding: 14px 32px; text-decoration: none; border-radius: 6px;
                              font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #6b7280; font-size: 14px; text-align: center;">
                This link expires on ${expiresDate}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                If you didn't request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '🔐 Reset your PlanFlow password',
      html,
    })

    if (error) {
      console.error('Failed to send password reset email:', error)
      return { success: false, error: error.message }
    }

    console.log(`Password reset email sent to ${to}: ${data?.id}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to send password reset email:', message)
    return { success: false, error: message }
  }
}

/**
 * Sends a welcome email to new users.
 * Non-blocking - logs errors but doesn't throw.
 *
 * @param to - Recipient email address
 * @param userName - User's display name
 * @returns Result with success status
 */
export async function sendWelcomeEmail(to: string, userName: string): Promise<EmailResult> {
  const resend = getResendClient()

  if (!resend) {
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to PlanFlow!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #6366f1; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">PlanFlow</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 24px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">
                Welcome to PlanFlow, ${escapeHtml(userName)}! 🎉
              </h2>
              <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px; line-height: 1.6;">
                You're all set to start managing your projects with AI-native tools. Here's how to get started:
              </p>
              <ul style="margin: 0 0 24px 0; padding-left: 24px; color: #374151; font-size: 16px; line-height: 1.8;">
                <li><strong>Create your first project</strong> in the dashboard</li>
                <li><strong>Install the Claude Code plugin</strong> to manage tasks from your terminal</li>
                <li><strong>Invite your team</strong> to collaborate on projects</li>
              </ul>
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="padding: 24px 0; text-align: center;">
                    <a href="${APP_URL}/dashboard"
                       style="display: inline-block; background-color: #6366f1; color: #ffffff;
                              padding: 14px 32px; text-decoration: none; border-radius: 6px;
                              font-weight: 600; font-size: 16px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Need help? Check out our <a href="${APP_URL}/docs" style="color: #6366f1; text-decoration: none;">documentation</a>
                or reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: '🎉 Welcome to PlanFlow!',
      html,
    })

    if (error) {
      console.error('Failed to send welcome email:', error)
      return { success: false, error: error.message }
    }

    console.log(`Welcome email sent to ${to}: ${data?.id}`)
    return { success: true, messageId: data?.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to send welcome email:', message)
    return { success: false, error: message }
  }
}

/**
 * Checks if the email service is configured and available.
 */
export function isEmailServiceConfigured(): boolean {
  return !!process.env['RESEND_API_KEY']
}
