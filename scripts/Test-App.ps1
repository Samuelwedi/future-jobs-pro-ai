[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 8181)

$ErrorActionPreference = 'Stop'
$BaseUrl = "http://127.0.0.1:$Port"

function Get-HttpStatus([string]$Uri) {
  try {
    $Response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10
    return [int]$Response.StatusCode
  }
  catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    throw
  }
}

$Health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 10
if ($Health.status -ne 'healthy' -or $Health.version -ne '1.2.0-rc.4') {
  throw "Unexpected health response: status=$($Health.status), version=$($Health.version)"
}

$LoginStatus = Get-HttpStatus "$BaseUrl/login"
if ($LoginStatus -ne 200) { throw "Login page returned HTTP $LoginStatus." }

$AnonymousUnknownApi = Get-HttpStatus "$BaseUrl/api/this-route-must-not-exist"
if ($AnonymousUnknownApi -notin @(401,403)) {
  throw "Anonymous unknown API returned HTTP $AnonymousUnknownApi; expected fail-closed 401 or 403."
}

$UnknownPageStatus = Get-HttpStatus "$BaseUrl/this-page-must-not-exist"
if ($UnknownPageStatus -ne 200) {
  throw "SPA fallback returned HTTP $UnknownPageStatus instead of 200."
}

[pscustomobject]@{
  Result              = 'RC3 PUBLIC SMOKE TEST PASSED'
  Health              = $Health.status
  Version             = $Health.version
  LoginPage           = $LoginStatus
  AnonymousUnknownApi = $AnonymousUnknownApi
  ApiPolicy           = 'FAIL CLOSED BEFORE ROUTE DISCLOSURE'
  SpaFallback         = $UnknownPageStatus
}
