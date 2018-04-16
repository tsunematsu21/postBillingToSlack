const aws          = require('aws-sdk');
const costexplorer = new aws.CostExplorer({ region: 'us-east-1' });
const https        = require('https');
const url          = require('url');

exports.handler = (event, context, callback) => {
  const today     = new Date();
  const startTime = `${today.getFullYear()}-${('0'+ (today.getMonth() + 1)).slice(-2)}-01`;
  const tomorrow  = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const endTime   = `${tomorrow.getFullYear()}-${('0'+ (tomorrow.getMonth() + 1)).slice(-2)}-${('0'+ tomorrow.getDate()).slice(-2)}`;
  
  const params = {
    Granularity: 'MONTHLY',
    Metrics: [ 'UnblendedCost' ],
    GroupBy: [{
      Type: 'DIMENSION',
      Key: 'REGION',
    },{
      Type: 'DIMENSION',
      Key: 'SERVICE',
    }],
    TimePeriod: {
      Start: startTime,
      End: endTime,
    },
  };
    
  const slack_req_opts   = url.parse(process.env.SLACK_WEBHOOK_URL);
  slack_req_opts.method  = 'POST';
  slack_req_opts.headers = {'Content-Type': 'application/json'};
    
  let billings = {};
  let total    = parseFloat(0);
    
  costexplorer.getCostAndUsage(params, function (err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      data.ResultsByTime[0].Groups.forEach((group) => {
        let region, service;
        [region, service] = group.Keys;

        total += parseFloat(group.Metrics.UnblendedCost.Amount);
        if (!billings[region]) billings[region] = {};
        billings[region][service] = group.Metrics;
      });
      
      let text = `:money_with_wings: *AWS Cost Report* (${startTime} - ${`${today.getFullYear()}-${('0'+ (today.getMonth() + 1)).slice(-2)}-${('0'+ today.getDate()).slice(-2)}`})`;

      let attachments = Object.keys(billings).sort((a, b) => {
        if (a == 'NoRegion') return 1
        if (b == 'NoRegion') return -1
        return a.localeCompare(b);
      }).map((region) => {
        let regionTotal = parseFloat(0);
        return {
          fields: Object.keys(billings[region]).sort().map((service) => {
            let cost     = billings[region][service].UnblendedCost.Amount
            let costUnit = billings[region][service].UnblendedCost.Unit;
            regionTotal += parseFloat(cost);
            return {
              title: service,
              value: `${cost} ${costUnit}`,
              short: true
            }
          }),
          title: `${region} (${regionTotal} USD)`,
          color: regionTotal > 0.0 ? 'good' : ''
        }
      });

      attachments.push({
        title: 'Total',
        text: `${total} USD`,
        color: 'danger'
      });

      let payload = {
        text: text,
        attachments: attachments
      }

      request(slack_req_opts, payload).then((res) => {
        console.log(res);
        callback(null, 'Success');
      }).catch((err) => {
        console.log(err, err.stack);
      });
    }
  });
};

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (response) => {
      resolve(response);
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(JSON.stringify(body));
        
    req.end();
  });
}
