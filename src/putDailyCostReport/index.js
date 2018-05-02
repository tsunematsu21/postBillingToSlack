const aws            = require('aws-sdk');
const costexplorer   = new aws.CostExplorer({ region: 'us-east-1' });
const documentClient = new aws.DynamoDB.DocumentClient({
  region: 'ap-northeast-1'
});

exports.handler = (event, context, callback) => {
  const now       = new Date(new Date().setHours(0, 0, 0, 0));
  const yesterday = new Date(new Date(new Date().setHours(0, 0, 0, 0)).setDate(now.getDate() - 1));
  const startTime = `${yesterday.getFullYear()}-${('0'+ (yesterday.getMonth() + 1)).slice(-2)}-${('0'+ yesterday.getDate()).slice(-2)}`;
  const endTime   = `${now.getFullYear()}-${('0'+ (now.getMonth() + 1)).slice(-2)}-${('0'+ now.getDate()).slice(-2)}`;
  
  const params = {
    Granularity: 'DAILY',
    Metrics: [ 'UnblendedCost' ],
    GroupBy: [{
      Type: 'DIMENSION',
      Key:  'REGION',
    },{
      Type: 'DIMENSION',
      Key:  'SERVICE',
    }],
    TimePeriod: {
      Start: startTime,
      End:   endTime,
    },
  };

  costexplorer.getCostAndUsage(params, function (err, data) {
    console.log(JSON.stringify(data));
    
    if (err) {
      console.log(err, err.stack);
    } else {
      data.ResultsByTime[0].Groups.forEach((group) => {
        let region, service;
        [region, service] = group.Keys;

        let cost    = group.Metrics.UnblendedCost.Amount;
        
        documentClient.put({
          TableName: process.env.TABLE_NAME,
          Item: {
            id: `${region}_${service}`,
            timestamp: parseInt(yesterday / 1000),
            region: region,
            service: service,
            cost: cost
          }
        }, (err, data) => {
          if (err) {
            console.log(err);
          }
        });
      });
    }
  });
};
