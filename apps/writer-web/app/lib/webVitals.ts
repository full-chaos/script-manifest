import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from "web-vitals";

function sendMetric(metric: Metric) {
  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
  if (!endpoint) {
    if (process.env.NODE_ENV === "development") {
      console.log(`[WebVital] ${metric.name}: ${metric.value}`);
    }
    return;
  }

  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, body);
  } else {
    fetch(endpoint, { body, method: "POST", keepalive: true });
  }
}

export function reportWebVitals() {
  onLCP(sendMetric);
  onINP(sendMetric);
  onCLS(sendMetric);
  onFCP(sendMetric);
  onTTFB(sendMetric);
}
