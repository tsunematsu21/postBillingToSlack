const AWS            = require('aws-sdk');
const costExplorer   = new AWS.CostExplorer({ region: 'us-east-1' });
const documentClient = new AWS.DynamoDB.DocumentClient({ region: process.env.DYNAMO_DB_REGION });

exports.handler = (event, context, callback) => {
  const now       = event.endTime   ? new Date(event.endTime)   : new Date(new Date().setHours(0, 0, 0, 0));
  const yesterday = event.startTime ? new Date(event.startTime) : new Date(new Date(new Date().setHours(0, 0, 0, 0)).setDate(now.getDate() - 1));
  const params    = {
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
      Start: event.startTime ? event.startTime : toTimePeriodFormat(yesterday),
      End:   event.endTime   ? event.endTime   : toTimePeriodFormat(now),
    },
  };

  costExplorer.getCostAndUsage(params, function (err, data) {
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

function toTimePeriodFormat(date) {
  return `${date.getFullYear()}-${('0'+ (date.getMonth() + 1)).slice(-2)}-${('0'+ date.getDate()).slice(-2)}`;
}
