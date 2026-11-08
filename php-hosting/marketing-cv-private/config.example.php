<?php
// Copy to config.php, then fill in values from cPanel. Never commit config.php.
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'CPANEL_DATABASE',
    'db_user' => 'CPANEL_DATABASE_USER',
    'db_password' => 'REPLACE_WITH_DATABASE_PASSWORD',
    'origin' => 'https://YOUR-DOMAIN.COM', // No trailing slash. Use your new domain.
    'setup_key' => 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS',
];
