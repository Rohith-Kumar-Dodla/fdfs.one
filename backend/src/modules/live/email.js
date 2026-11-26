import { formatEventTime } from '../../../../shared/live.js';
import { createMailTransport } from '../../services/email.js';

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
        from: config.smtp?.from,
        to: recipient,
        messageId: '<live-' + deliveryId + '@' + url.hostname + '>',
        subject: 'FDFS Live reminder: ' + event.title,
        text:
          event.title +
          ' is scheduled for ' +
          formatEventTime(event.startAt, event.timeZone, 'en-IN') +
          ' (' +
          event.timeZone +
          ').\n\n' +
          url.href,
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
