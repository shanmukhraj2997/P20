import logging
from django.conf import settings
from django.core.mail import send_mail
from accounts.models import Notification

logger = logging.getLogger(__name__)

def send_notification(user, notification_type, message, title=None):
    """
    Creates an in-app Notification record and dispatches an email notification.
    Safe against email delivery failures.
    """
    if not title:
        title = dict(Notification.TYPE_CHOICES).get(notification_type, notification_type.replace('_', ' ').title())

    # 1. Create DB Notification record
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        read=False
    )

    # 2. Dispatch email (console in dev, SMTP in prod)
    if user.email:
        try:
            subject = f"[P20 Campus Booking] {title}"
            email_body = f"Hello {user.get_full_name() or user.username},\n\n{message}\n\n--\nP20 Campus Resource Booking Platform"
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@campus.edu')
            send_mail(
                subject=subject,
                message=email_body,
                from_email=from_email,
                recipient_list=[user.email],
                fail_silently=True
            )
        except Exception as e:
            logger.warning("Failed to dispatch email notification to %s: %s", user.email, e)

    return notification
