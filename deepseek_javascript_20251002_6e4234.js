// autoScaling/scalingManager.js
import AWS from 'aws-sdk';

const autoscaling = new AWS.AutoScaling();
const cloudwatch = new AWS.CloudWatch();

export class ScalingManager {
  constructor() {
    this.scalingConfig = {
      scaleUpCPU: 70, // Scale up when CPU > 70%
      scaleDownCPU: 30, // Scale down when CPU < 30%
      scaleUpMemory: 80, // Scale up when memory > 80%
      maxInstances: 10,
      minInstances: 2
    };
  }

  async checkAndScale() {
    try {
      const metrics = await this.getCurrentMetrics();
      const scalingAction = await this.determineScalingAction(metrics);
      
      if (scalingAction !== 'none') {
        await this.executeScaling(scalingAction);
      }
      
      return scalingAction;
    } catch (error) {
      console.error('Scaling error:', error);
    }
  }

  async getCurrentMetrics() {
    const params = {
      MetricDataQueries: [
        {
          Id: 'cpuUsage',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'CPUUtilization'
            },
            Period: 300,
            Stat: 'Average'
          }
        },
        {
          Id: 'memoryUsage',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/EC2',
              MetricName: 'MemoryUtilization'
            },
            Period: 300,
            Stat: 'Average'
          }
        }
      ],
      StartTime: new Date(Date.now() - 600000), // Last 10 minutes
      EndTime: new Date()
    };

    const data = await cloudwatch.getMetricData(params).promise();
    
    return {
      cpu: data.MetricDataResults[0].Values[0] || 0,
      memory: data.MetricDataResults[1].Values[0] || 0
    };
  }

  async determineScalingAction(metrics) {
    const { cpu, memory } = metrics;
    
    if (cpu > this.scalingConfig.scaleUpCPU || memory > this.scalingConfig.scaleUpMemory) {
      return 'scale_up';
    } else if (cpu < this.scalingConfig.scaleDownCPU) {
      return 'scale_down';
    }
    
    return 'none';
  }

  async executeScaling(action) {
    const autoScalingGroupName = 'peoplelink-asg';
    
    const currentCapacity = await this.getCurrentCapacity(autoScalingGroupName);
    let desiredCapacity = currentCapacity;

    if (action === 'scale_up' && currentCapacity < this.scalingConfig.maxInstances) {
      desiredCapacity = Math.min(currentCapacity + 1, this.scalingConfig.maxInstances);
    } else if (action === 'scale_down' && currentCapacity > this.scalingConfig.minInstances) {
      desiredCapacity = Math.max(currentCapacity - 1, this.scalingConfig.minInstances);
    }

    if (desiredCapacity !== currentCapacity) {
      const params = {
        AutoScalingGroupName: autoScalingGroupName,
        DesiredCapacity: desiredCapacity
      };

      await autoscaling.setDesiredCapacity(params).promise();
      console.log(`Scaling ${action}: ${currentCapacity} -> ${desiredCapacity} instances`);
    }
  }

  async getCurrentCapacity(autoScalingGroupName) {
    const params = {
      AutoScalingGroupNames: [autoScalingGroupName]
    };

    const data = await autoscaling.describeAutoScalingGroups(params).promise();
    return data.AutoScalingGroups[0].DesiredCapacity;
  }
}

// Initialize and run scaling checks every 5 minutes
const scalingManager = new ScalingManager();
setInterval(() => scalingManager.checkAndScale(), 300000);