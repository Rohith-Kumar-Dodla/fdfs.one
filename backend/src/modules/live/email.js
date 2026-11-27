import { formatEventTime } from '../../../../shared/live.js';
import {
  brandedMail,
  createMailTransport,
  mailFrom,
} from '../../services/email.js';

export function createReminderDelivery(
  config,
  logger,
  transport = createMailTransport(config),
) {
  return async ({ event, recipient, deliveryId }) => {
    if (!transport) return 'retry';
    const url = new URL('/live/' + event.slug, config.webOrigin);
    try {
      const { accepted } = await transport.sendMail({
        from: mailFrom(config),
        to: recipient,
        messageId: '<live-' + deliveryId + '@' + url.hostname + '>',
        ...brandedMail({
          subject: 'FDFS Live reminder: ' + event.title,
          copy:
            event.title +
            ' is scheduled for ' +
            formatEventTime(event.startAt, event.timeZone, 'en-IN') +
            ' (' +
            event.timeZone +
            ').',
          action: 'View live event',
          url: url.href,
        }),
      });
      return accepted?.length ? 'sent' : 'failed';
    } catch (error) {
      logger.warn('Live reminder delivery did not complete');
      if (error.responseCode >= 400 && error.responseCode < 500) return 'retry';
      if (error.responseCode >= 500) return 'failed';
      return 'uncertain';
    }
  };
}
