import boto3, os
from datetime import datetime, timedelta
import urllib.request, json

DATE_FORMAT = '%Y-%m-%d'

def lambda_handler(event, context):
  # TODO implement
  today      = datetime.today()
  start_date = datetime(today.year, today.month, 1, 0, 0, 0)
  end_date   = today + timedelta(days=1)
  client     = boto3.client('ce')
  
  response = client.get_cost_and_usage(
    TimePeriod={
      'Start' : start_date.strftime(DATE_FORMAT),
      'End'   : end_date.strftime(DATE_FORMAT)
    },
    Granularity='MONTHLY',
    Metrics=['UnblendedCost'],
    GroupBy=[
      {
        'Type' : 'DIMENSION',
        'Key'  : 'REGION'
      },
      {
        'Type' : 'DIMENSION',
        'Key'  : 'SERVICE'
      }
    ]
  )

  total_cost = 0
  billings = {}

  for group in response['ResultsByTime'][0]['Groups']:
    region  = group['Keys'][0]
    service = group['Keys'][1]
    amount  = group['Metrics']['UnblendedCost']['Amount']
    total_cost += float(amount)
    
    if not region in billings:
      billings[region] = {}
      
    billings[region][service] = amount
  
  text = 'AWS Cost Report (%s - %s)' % (start_date.strftime('%Y/%m/%d'), today.strftime('%Y/%m/%d'))
  attachments = []
  
  for region, services in billings.items():
    region_total_cost = 0
    attachment = {
      'fields': []
    }
    
    for service, amount in services.items():
      region_total_cost += float(amount)
      attachment['fields'].append({
        'title': service,
        'value': '%s USD' % (float(amount)),
        'short': True
      })
      
    attachment['title'] = '%s (%s USD)' % (region, region_total_cost)
    if region_total_cost > 0:
      attachment['color'] = 'good'
    
    attachments.append(attachment)
  
  attachments.append({
    'title': 'Total',
    'text': '%s USD' % (total_cost),
    'color': 'danger'
  })
  
  payload = {
    'text': text,
    'attachments': attachments
  }
  
  json_data = json.dumps(payload).encode("utf-8")
  request = urllib.request.Request(
    os.environ['SLACK_WEBHOOK_URL'],
    data    = json_data,
    method  = 'POST',
    headers = {"Content-Type" : "application/json"}
  )
  
  with urllib.request.urlopen(request) as response:
    response_body = response.read().decode("utf-8")
  
  print('resp:%s' % (response_body))
  return 'Hello from Lambda'
