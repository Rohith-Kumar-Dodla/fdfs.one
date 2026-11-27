import { randomUUID } from 'node:crypto';
import {
  brandedMail,
  createMailTransport,
  mailFrom,
} from '../../services/email.js';
import { User } from '../auth/models.js';
import { can } from '../../../../shared/admin.js';
import { GuestChallenge, SupportJob, Ticket } from './support-models.js';
import { guestLinkToken } from './support.js';

const subjects = {
  verify: 'Verify your FDFS.ONE support email',
  created: 'FDFS.ONE support request received',
  reply: 'New reply from FDFS.ONE support',
  status: 'FDFS.ONE support status updated',
  resolved: 'FDFS.ONE support request resolved',
  follow_up: 'FDFS.ONE support follow-up received',
};

export function supportMailer(
  auth,
  logger,
  transport = createMailTransport(auth),
  staffEmail = false,
) {
  return async (job) => {
    if (!transport) return 'disabled';
    const url = new URL('/support', auth.webOrigin);
    let recipient;
    let reference = '';
    if (job.type === 'verify') {
      const challenge = await GuestChallenge.findOne({
        _id: job.challenge,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      }).select('+email');
      if (!challenge) return 'disabled';
      recipient = challenge.email;
      url.pathname = '/support/guest';
      url.hash = new URLSearchParams({
        token: guestLinkToken(auth.accessSecret, challenge.id),
      }).toString();
    } else {
      const ticket = await Ticket.findOne({ publicId: job.ticket }).select(
        '+guestEmail',
      );
      if (!ticket) return 'disabled';
      reference = ' (' + ticket.reference + ')';
      if (job.type === 'follow_up') {
        if (!staffEmail || ticket.assigned !== job.owner) return 'disabled';
        const staff = await User.findOne({
          publicId: job.owner,
          status: 'active',
          emailVerifiedAt: { $type: 'date' },
        });
        if (can(staff, 'support')) recipient = staff.email;
        url.pathname = '/admin/support/' + ticket.publicId;
      } else if (ticket.owner) {
        const user = await User.findOne({
          publicId: ticket.owner,
          status: 'active',
          emailVerifiedAt: { $type: 'date' },
        }).select('email');
        recipient = user?.email;
        url.pathname = '/support/tickets/' + ticket.publicId;
      } else recipient = ticket.guestEmail;
    }
    if (!recipient) return 'disabled';
    try {
      const result = await transport.sendMail({
        from: mailFrom(auth),
        to: recipient,
        messageId:
          '<support-' + job.id.replaceAll(':', '.') + '@' + url.hostname + '>',
        ...brandedMail({
          subject: subjects[job.type] + reference,
          copy: subjects[job.type] + reference + '.',
          action: 'Open FDFS.ONE Support',
          url: url.href,
        }),
      });
      return result.accepted?.length ? 'accepted' : 'failed';
    } catch (error) {
      logger.warn('Support email attempt did not complete');
      if (error.responseCode >= 400 && error.responseCode < 500) return 'retry';
      if (error.responseCode >= 500) return 'failed';
      return 'uncertain';
    }
  };
}

export async function processSupportJobs(
  deliver,
  { attempts = 3, limit = 10, now = new Date(), running = () => true } = {},
) {
  await SupportJob.updateMany(
    { status: 'sending', leaseUntil: { $lte: now } },
    { $set: { status: 'uncertain' }, $unset: { claim: 1, leaseUntil: 1 } },
  );
  let processed = 0;
  while (processed < limit && running()) {
    const claim = randomUUID();
    const leaseUntil = new Date(Math.max(+now, Date.now()) + 60000);
    const job = await SupportJob.findOneAndUpdate(
      {
        dueAt: { $lte: now },
        expiresAt: { $gt: now },
        $or: [
          { status: 'queued' },
          { status: 'claimed', leaseUntil: { $lte: now } },
        ],
      },
      { $set: { status: 'claimed', claim, leaseUntil } },
      { sort: { dueAt: 1 }, returnDocument: 'after' },
    );
    if (!job) break;
    processed++;
    const owned = { _id: job.id, claim };
    const armed = await SupportJob.updateOne(
      { ...owned, status: 'claimed' },
      {
        $set: { status: 'sending', attemptedAt: new Date() },
        $inc: { attempts: 1 },
      },
    );
    if (!armed.modifiedCount) continue;
    let status;
    try {
      status = await deliver(job);
    } catch {
      status = 'uncertain';
    }
    if (
      !['accepted', 'failed', 'uncertain', 'disabled', 'retry'].includes(status)
    )
      status = 'uncertain';
    const retry = status === 'retry' && job.attempts + 1 < attempts;
    await SupportJob.updateOne(
      { ...owned, status: 'sending' },
      {
        $set: {
          status: retry ? 'queued' : status === 'retry' ? 'failed' : status,
          ...(retry && {
            dueAt: new Date(
              Math.max(Date.now(), +now) + 60000 * (job.attempts + 1),
            ),
          }),
          ...(status === 'accepted' && { acceptedAt: new Date() }),
        },
        $unset: { claim: 1, leaseUntil: 1 },
      },
    );
  }
  return processed;
}

export function startSupportWorker(
  deliver,
  { available, logger, health, attempts },
) {
  let active;
  let stopping = false;
  const timer = setInterval(() => {
    if (active || !available()) return;
    active = processSupportJobs(deliver, { attempts, running: () => !stopping })
      .then(() => health('supportWorker', 'healthy'))
      .catch(() => {
        health('supportWorker', 'degraded');
        logger.warn('Support email worker scan failed');
      })
      .finally(() => {
        active = undefined;
      });
  }, 15000).unref();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await active;
  };
}
