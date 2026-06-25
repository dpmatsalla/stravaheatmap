<?php
$client_id = '108742';
$client_secret = 'ab3fdd70c8b66837005361fa7c17eb53ddf0cdf1';
$token_url = 'https://www.strava.com/oauth/token';

if (isset($_POST['code'])) {
    $code = $_POST['code'];

    $postData = http_build_query([
        'client_id' => $client_id,
        'client_secret' => $client_secret,
        'code' => $code,
        'grant_type' => 'authorization_code'
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $token_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        echo json_encode(['error' => curl_error($ch)]);
    } else {
        echo $response;
    }

    curl_close($ch);
}
?>