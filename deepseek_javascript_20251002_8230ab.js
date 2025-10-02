// services/googleAnalytics.js
import { BetaAnalyticsDataClient } from '@google-analytics/data';

export class GoogleAnalyticsService {
  constructor() {
    this.analyticsDataClient = new BetaAnalyticsDataClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  async getPageViews(startDate, endDate) {
    const [response] = await this.analyticsDataClient.runReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }]
    });

    return response.rows.map(row => ({
      page: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value)
    }));
  }

  async getUserBehavior(startDate, endDate) {
    const [response] = await this.analyticsDataClient.runReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'sessionSource' },
        { name: 'deviceCategory' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' }
      ]
    });

    return response.rows.map(row => ({
      source: row.dimensionValues[0].value,
      device: row.dimensionValues[1].value,
      sessions: parseInt(row.metricValues[0].value),
      avgDuration: parseFloat(row.metricValues[1].value),
      bounceRate: parseFloat(row.metricValues[2].value)
    }));
  }

  async getRealTimeActiveUsers() {
    const [response] = await this.analyticsDataClient.runRealtimeReport({
      property: `properties/${process.env.GA_PROPERTY_ID}`,
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }]
    });

    return response.rows.reduce((total, row) => 
      total + parseInt(row.metricValues[0].value), 0
    );
  }
}