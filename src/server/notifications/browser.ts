import webpush from 'web-push';
import prisma from '../db.js';

let vapidKeys: { publicKey: string; privateKey: string } | null = null;
let initialized = false;

function init(): boolean {
  if (initialized) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (publicKey && privateKey) {
    vapidKeys = { publicKey, privateKey };
  } else {
    // Auto-generate for dev
    vapidKeys = webpush.generateVAPIDKeys();
    console.log('[WebPush] Auto-generated VAPID keys. Save these to .env for production:');
    console.log(`  VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
    console.log(`  VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  }

  webpush.setVapidDetails(
    'mailto:admin@hotmonitor.local',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  initialized = true;
  return true;
}

export function getVapidPublicKey(): string {
  init();
  return vapidKeys!.publicKey;
}

export async function sendPushNotification(params: {
  title: string;
  body: string;
  topicId: number;
}): Promise<void> {
  init();

  try {
    const subscriptionStr = await prisma.setting.findUnique({
      where: { key: 'push_subscription' },
    });

    if (!subscriptionStr?.value) return;

    const subscription = JSON.parse(subscriptionStr.value);

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: params.title,
        body: params.body,
        icon: '/icon-192.png',
        data: {
          topicId: params.topicId,
          url: `/topics/${params.topicId}`,
        },
      }),
      { TTL: 3600 }
    );
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired, remove it
      await prisma.setting.delete({ where: { key: 'push_subscription' } }).catch(() => {});
    }
    // Silently fail — push is best-effort
  }
}
