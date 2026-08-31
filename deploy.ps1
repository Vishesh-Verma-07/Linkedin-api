#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Setup and deployment script for LinkedIn API
#>

param(
    [string]$Platform = "railway"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LinkedIn API Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Node.js is not installed. Please install Node.js >= 18." -ForegroundColor Red
    exit 1
}
Write-Host "Node.js: $nodeVersion" -ForegroundColor Green

$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm is not installed." -ForegroundColor Red
    exit 1
}
Write-Host "npm: $npmVersion" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed successfully." -ForegroundColor Green

# Check for required environment variables
Write-Host ""
Write-Host "Checking environment variables..." -ForegroundColor Yellow

if (-not $env:LINKEDIN_LI_AT) {
    Write-Host "WARNING: LINKEDIN_LI_AT is not set." -ForegroundColor Yellow
    $liAt = Read-Host "Enter your LinkedIn li_at cookie"
    $env:LINKEDIN_LI_AT = $liAt
}

if (-not $env:LINKEDIN_JSESSIONID) {
    Write-Host "WARNING: LINKEDIN_JSESSIONID is not set." -ForegroundColor Yellow
    $jsessionId = Read-Host "Enter your LinkedIn JSESSIONID cookie"
    $env:LINKEDIN_JSESSIONID = $jsessionId
}

Write-Host "Environment variables configured." -ForegroundColor Green

# Test server locally
Write-Host ""
Write-Host "Testing server locally..." -ForegroundColor Yellow
$server = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "src/server.js" -PassThru
Start-Sleep -Seconds 2

try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 5
    Write-Host "Server health check: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Local server test failed. This might be due to missing LinkedIn credentials." -ForegroundColor Yellow
}

Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
Write-Host "Local server stopped." -ForegroundColor Green

# Deployment instructions
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deployment Instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

switch ($Platform.ToLower()) {
    "railway" {
        Write-Host "To deploy to Railway:" -ForegroundColor Yellow
        Write-Host "1. Push this code to a GitHub repository" -ForegroundColor White
        Write-Host "2. Go to https://railway.app/new" -ForegroundColor White
        Write-Host "3. Select 'Deploy from GitHub repo'" -ForegroundColor White
        Write-Host "4. Select your repository" -ForegroundColor White
        Write-Host "5. Set environment variables in Railway dashboard:" -ForegroundColor White
        Write-Host "   - LINKEDIN_LI_AT" -ForegroundColor Gray
        Write-Host "   - LINKEDIN_JSESSIONID" -ForegroundColor Gray
        Write-Host "6. Railway will provide a public HTTPS URL" -ForegroundColor White
    }
    "render" {
        Write-Host "To deploy to Render:" -ForegroundColor Yellow
        Write-Host "1. Push this code to a GitHub repository" -ForegroundColor White
        Write-Host "2. Go to https://dashboard.render.com" -ForegroundColor White
        Write-Host "3. Click 'New +' -> 'Web Service'" -ForegroundColor White
        Write-Host "4. Connect your GitHub repository" -ForegroundColor White
        Write-Host "5. Set environment variables in Render dashboard" -ForegroundColor White
        Write-Host "6. Render will deploy and provide a public HTTPS URL" -ForegroundColor White
    }
    default {
        Write-Host "See DEPLOY.md for deployment options." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
