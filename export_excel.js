const fs = require('fs');
const path = require('path');

function generateExcelDatabase() {
  const dataFile = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataFile)) {
    return;
  }

  let db = {};
  try {
    db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (err) {
    console.error('Error reading data.json for Excel export:', err);
    return;
  }

  // 1. Gather all clubs
  const clubs = {};
  for (const [key, val] of Object.entries(db)) {
    if (key.startsWith('clubs/')) {
      clubs[val.username] = {
        id: val.id,
        username: val.username,
        name: val.name,
        emblem: val.emblem || '🏓',
        points: 0,
        played: 0,
        wins: 0,
        losses: 0,
        pendingPoints: 0,
        pendingScans: 0,
        lastScanTime: 'N/A',
        lastScanTimestamp: 0,
      };
    }
  }

  // 2. Gather match scans
  const scansList = [];
  for (const [key, val] of Object.entries(db)) {
    if (key.startsWith('wins/') && val) {
      const u = val.username;
      if (!clubs[u]) {
        clubs[u] = {
          id: val.clubId || u,
          username: u,
          name: val.clubName || u,
          emblem: val.clubEmblem || '🏓',
          points: 0,
          played: 0,
          wins: 0,
          losses: 0,
          pendingPoints: 0,
          pendingScans: 0,
          lastScanTime: 'N/A',
          lastScanTimestamp: 0,
        };
      }

      const club = clubs[u];
      const pts = Number(val.points) || 0;
      const scanDate = val.createdAt ? new Date(val.createdAt).toLocaleString() : 'N/A';

      if (val.status === 'confirmed') {
        club.points += pts;
        club.played += 1;
        if (pts >= 1 || val.outcome === 'win') {
          club.wins += 1;
        } else {
          club.losses += 1;
        }
      } else if (val.status === 'pending') {
        club.pendingPoints += pts;
        club.pendingScans += 1;
      }

      if (val.createdAt && val.createdAt > club.lastScanTimestamp) {
        club.lastScanTimestamp = val.createdAt;
        club.lastScanTime = scanDate;
      }

      scansList.push({
        id: val.id || key.replace('wins/', ''),
        username: val.username,
        clubName: club.name,
        challenge: val.challenge || 'Ping Pong Match',
        outcome: (val.outcome || (pts >= 1 ? 'WIN' : 'MATCH')).toUpperCase(),
        points: pts,
        status: (val.status || 'confirmed').toUpperCase(),
        date: scanDate,
        timestamp: val.createdAt || 0,
      });
    }
  }

  // Sort clubs: points desc, wins desc, played asc, name asc
  const sortedClubs = Object.values(clubs).sort((a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));
  sortedClubs.forEach((c, idx) => {
    c.rank = idx + 1;
    c.winRate = c.played > 0 ? ((c.wins / c.played) * 100).toFixed(1) + '%' : '0.0%';
  });

  // Sort scans: latest first
  scansList.sort((a, b) => b.timestamp - a.timestamp);

  const bom = '\uFEFF';

  // 1. Generate CSV: Standings
  let standingsCsv = bom + [
    'Rank',
    'Club Name',
    'Username',
    'Total Points',
    'Matches Played',
    'Wins (+1 pt)',
    'Losses (0 pts)',
    'Win Rate',
    'Pending Points',
    'Last Scan Time',
  ].map((h) => `"${h}"`).join(',') + '\r\n';

  for (const c of sortedClubs) {
    standingsCsv += [
      c.rank,
      `"${c.name}"`,
      `"${c.username}"`,
      c.points,
      c.played,
      c.wins,
      c.losses,
      `"${c.winRate}"`,
      c.pendingPoints,
      `"${c.lastScanTime}"`,
    ].join(',') + '\r\n';
  }

  fs.writeFileSync(path.join(__dirname, 'participants_database.csv'), standingsCsv, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'public', 'participants_database.csv'), standingsCsv, 'utf8');

  // 2. Generate CSV: Match Scans Log
  let scansCsv = bom + [
    'Scan ID',
    'Club Name',
    'Username',
    'Match Title',
    'Outcome',
    'Points',
    'Referee Status',
    'Date & Time',
  ].map((h) => `"${h}"`).join(',') + '\r\n';

  for (const s of scansList) {
    scansCsv += [
      `"${s.id}"`,
      `"${s.clubName}"`,
      `"${s.username}"`,
      `"${s.challenge}"`,
      `"${s.outcome}"`,
      s.points,
      `"${s.status}"`,
      `"${s.date}"`,
    ].join(',') + '\r\n';
  }

  fs.writeFileSync(path.join(__dirname, 'game_scans_log.csv'), scansCsv, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'public', 'game_scans_log.csv'), scansCsv, 'utf8');

  // 3. Generate XML-based Multi-Sheet Excel Workbook (.xls)
  let xmlExcel = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#79AE44"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="14" ss:Color="#79AE44" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="RankGold">
   <Alignment ss:Horizontal="Center"/>
   <Font ss:FontName="Segoe UI" ss:Bold="1" ss:Color="#79AE44"/>
  </Style>
  <Style ss:ID="Centered">
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="BoldText">
   <Font ss:FontName="Segoe UI" ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Six Clubs Ping Pong">
  <Table>
   <Column ss:Width="50"/>
   <Column ss:Width="200"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="70"/>
   <Column ss:Width="70"/>
   <Column ss:Width="70"/>
   <Column ss:Width="90"/>
   <Column ss:Width="160"/>
   <Row ss:Height="32">
    <Cell ss:MergeAcross="8" ss:StyleID="TitleStyle"><Data ss:Type="String">PING PONG CHAMPIONSHIP - OFFICIAL STANDINGS (6 CLUBS)</Data></Cell>
   </Row>
   <Row ss:Height="26">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Rank</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Club Name</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Username</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Total Points</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Played</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Wins (+1)</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Losses (0)</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Win Rate</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Last Match Time</Data></Cell>
   </Row>`;

  for (const c of sortedClubs) {
    xmlExcel += `
   <Row ss:Height="22">
    <Cell ss:StyleID="${c.rank === 1 ? 'RankGold' : 'Centered'}"><Data ss:Type="Number">${c.rank}</Data></Cell>
    <Cell ss:StyleID="BoldText"><Data ss:Type="String">${escapeXml(c.name)}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="String">${escapeXml(c.username)}</Data></Cell>
    <Cell ss:StyleID="BoldText"><Data ss:Type="Number">${c.points}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="Number">${c.played}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="Number">${c.wins}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="Number">${c.losses}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="String">${c.winRate}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(c.lastScanTime)}</Data></Cell>
   </Row>`;
  }

  xmlExcel += `
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Match Scans Log">
  <Table>
   <Column ss:Width="160"/>
   <Column ss:Width="180"/>
   <Column ss:Width="100"/>
   <Column ss:Width="200"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="110"/>
   <Column ss:Width="160"/>
   <Row ss:Height="26">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Scan ID</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Club Name</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Username</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Match Title</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Outcome</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Points</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Date &amp; Time</Data></Cell>
   </Row>`;

  for (const s of scansList) {
    xmlExcel += `
   <Row ss:Height="20">
    <Cell><Data ss:Type="String">${escapeXml(s.id)}</Data></Cell>
    <Cell ss:StyleID="BoldText"><Data ss:Type="String">${escapeXml(s.clubName)}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="String">${escapeXml(s.username)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(s.challenge)}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="String">${escapeXml(s.outcome)}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="Number">${s.points}</Data></Cell>
    <Cell ss:StyleID="Centered"><Data ss:Type="String">${escapeXml(s.status)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(s.date)}</Data></Cell>
   </Row>`;
  }

  xmlExcel += `
  </Table>
 </Worksheet>
</Workbook>`;

  fs.writeFileSync(path.join(__dirname, 'participants_database.xls'), xmlExcel, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'public', 'participants_database.xls'), xmlExcel, 'utf8');
  console.log('Generated Ping Pong Tournament Excel & CSV reports.');
}

function escapeXml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { generateExcelDatabase };

if (require.main === module) {
  generateExcelDatabase();
}
