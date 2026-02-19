#!/bin/bash
CSS=$(cat dist/assets/index-DJlvJZr0.css)
JS=$(cat dist/assets/index-LckaJvbE.js)
cat > /mnt/user-data/outputs/fortuna-engine-v9.2.html << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fortuna Engine v9.2 — Financial Intelligence</title>
<style>$CSS</style>
</head>
<body>
<div id="root"></div>
<script type="module">$JS</script>
</body>
</html>
HTMLEOF
echo "Generated: $(wc -c < /mnt/user-data/outputs/fortuna-engine-v9.2.html) bytes"
