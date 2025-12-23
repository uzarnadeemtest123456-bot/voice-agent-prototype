# Deployment Guide - Vercel

This guide will walk you through deploying your Voice Assistant app to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)
3. **API Keys**: Have all required API keys ready:
   - OpenAI API Key
   - MiniMax API Key & Group ID
   - n8n Webhook URL

## Step 1: Prepare Your Project

Your project is already configured with:
- ✅ `vercel.json` - Vercel configuration file
- ✅ `.env.example` - Template for environment variables
- ✅ `.gitignore` - Excludes sensitive files from Git

**Important**: Make sure `.env.local` is NOT committed to Git (it should be in `.gitignore`).

## Step 2: Push to Git Repository

If you haven't already, initialize and push your code to a Git repository:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com/new](https://vercel.com/new)
   - Sign in with your account

2. **Import Your Repository**
   - Click "Add New..." → "Project"
   - Select your Git provider (GitHub/GitLab/Bitbucket)
   - Choose your repository: `vapi_voice_test`
   - Click "Import"

3. **Configure Your Project**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build` (auto-filled)
   - **Output Directory**: `.next` (auto-filled)

4. **Add Environment Variables**
   Click on "Environment Variables" and add the following:

   | Name | Value | Notes |
   |------|-------|-------|
   | `NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL` | Your n8n webhook URL | Publicly accessible (NEXT_PUBLIC) |
   | `OPENAI_API_KEY` | Your OpenAI API key | Server-side only (secure) |
   | `MINIMAX_API_KEY` | Your MiniMax API key | Server-side only (secure) |
   | `MINIMAX_GROUP_ID` | Your MiniMax Group ID | Server-side only (secure) |
   | `MINIMAX_VOICE_ID` | `moss_audio_10aac8df-bbf2-11f0-9c0e-b68b6d146e10` | Voice configuration |

   ⚠️ **Important**: Copy these values from your `.env.local` file

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete (usually 1-3 minutes)
   - You'll get a production URL: `https://your-project.vercel.app`

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   - Follow the prompts to link your project
   - Vercel will detect Next.js automatically

4. **Add Environment Variables**
   ```bash
   vercel env add OPENAI_API_KEY
   vercel env add MINIMAX_API_KEY
   vercel env add MINIMAX_GROUP_ID
   vercel env add MINIMAX_VOICE_ID
   vercel env add NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL
   ```
   - Enter each value when prompted
   - Select "Production" environment

5. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## Step 4: Verify Deployment

1. **Visit Your Deployed App**
   - Open the URL provided by Vercel (e.g., `https://your-project.vercel.app/voice`)

2. **Test Functionality**
   - Check if the voice interface loads
   - Test voice recording and playback
   - Verify API routes are working (`/api/tts` and `/api/stt`)

3. **Check Logs**
   - Go to your project dashboard on Vercel
   - Click "Deployments" → Select your deployment → "Functions"
   - View logs for any errors

## Step 5: Custom Domain (Optional)

1. **Go to Project Settings**
   - Navigate to your project on Vercel Dashboard
   - Click "Settings" → "Domains"

2. **Add Domain**
   - Enter your custom domain
   - Follow DNS configuration instructions
   - Wait for DNS propagation (can take up to 48 hours)

## Environment Variables Reference

| Variable | Type | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_N8N_BRAIN_WEBHOOK_URL` | Public | n8n webhook endpoint for streaming responses |
| `OPENAI_API_KEY` | Secret | OpenAI API key for Whisper STT |
| `MINIMAX_API_KEY` | Secret | MiniMax API key for TTS streaming |
| `MINIMAX_GROUP_ID` | Secret | MiniMax Group ID |
| `MINIMAX_VOICE_ID` | Secret | Voice ID for TTS (default provided) |

**Note**: Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. All others are server-side only.

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Review build logs in Vercel dashboard
- Ensure Node.js version compatibility

### API Routes Not Working
- Verify environment variables are set correctly
- Check function logs in Vercel dashboard
- Ensure API keys are valid

### Voice Features Not Working
- Check browser console for errors
- Verify CORS settings for n8n webhook
- Test API endpoints directly: `https://your-app.vercel.app/api/tts`

### Environment Variables Not Applied
- After adding/updating env vars, redeploy:
  ```bash
  vercel --prod
  ```
- Or trigger a redeploy from Vercel dashboard

## Continuous Deployment

Vercel automatically deploys:
- **Production**: Commits to `main` branch
- **Preview**: Pull requests and other branches

To disable auto-deployment:
- Go to Project Settings → Git → Adjust deployment settings

## Monitoring

Monitor your app through Vercel Dashboard:
- **Analytics**: User visits and performance
- **Logs**: Function execution logs
- **Speed Insights**: Performance metrics
- **Web Vitals**: Core Web Vitals scores

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Environment Variables in Vercel](https://vercel.com/docs/concepts/projects/environment-variables)

## Support

If you encounter issues:
1. Check Vercel documentation
2. Review deployment logs
3. Contact Vercel support at [vercel.com/support](https://vercel.com/support)
