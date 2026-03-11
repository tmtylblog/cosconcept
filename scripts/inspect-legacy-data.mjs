import { readFileSync } from 'fs';

const orgs = JSON.parse(readFileSync('./data/legacy/Data Dump (JSON)/Step 2_ Organization Basic Data/organization.json', 'utf8'));
const clients = JSON.parse(readFileSync('./data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/clients.json', 'utf8'));

const orgList = orgs.data.organisation;
const clientList = clients.data.company;

function extractDomain(url) {
  if (!url) return null;
  let d = url.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0];
  return d && d.includes('.') ? d : null;
}

// Counts
console.log('=== COUNTS ===');
console.log('Orgs:', orgList.length);
console.log('Clients:', clientList.length);

// Website checks
const orgsWithDomain = orgList.filter(o => extractDomain(o.organisation_detail.website));
const clientsWithDomain = clientList.filter(c => extractDomain(c.website));
const clientLinkedinAsWebsite = clientList.filter(c => c.website && c.website.includes('linkedin'));
console.log('\n=== DOMAIN AVAILABILITY ===');
console.log('Orgs with valid domain:', orgsWithDomain.length, '/ skipped:', orgList.length - orgsWithDomain.length);
console.log('Clients with valid domain:', clientsWithDomain.length, '/ skipped:', clientList.length - clientsWithDomain.length);
console.log('Clients with LinkedIn as website (skip):', clientLinkedinAsWebsite.length);

// Dedup check
const orgDomains = new Set(orgList.map(o => extractDomain(o.organisation_detail.website)).filter(Boolean));
const clientDomains = clientList.map(c => extractDomain(c.website)).filter(Boolean);
const overlap = clientDomains.filter(d => orgDomains.has(d));
console.log('\n=== OVERLAP (same domain in both orgs + clients) ===');
console.log('Overlapping domains:', overlap.length, '(clients with same domain as a COS org — will merge)');
console.log('Sample overlap:', [...new Set(overlap)].slice(0, 5));

// Unique client domains after dedup + removing org overlap
const uniqueClientDomains = new Set(clientDomains.filter(d => !orgDomains.has(d)));
console.log('\n=== FINAL IMPORT ESTIMATE ===');
console.log('COS orgs (isCosCustomer=true):', orgDomains.size);
console.log('Net new client companies (isCosCustomer=false):', uniqueClientDomains.size);
console.log('Total unique Company nodes to create:', orgDomains.size + uniqueClientDomains.size);

// Sample org fields
console.log('\n=== SAMPLE ORG ===');
const sample = orgList[0];
console.log(JSON.stringify({ id: sample.id, ...sample.organisation_detail }, null, 2));
