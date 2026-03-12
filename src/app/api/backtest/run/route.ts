export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import crypto from 'crypto';

const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function getCacheKey(body: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { universe = [], goal = 'balanced', rebalanceFreq = 'monthly', period, cash = 100000,
            stopLoss = 8, takeProfit = 16, maxPositionPct = 25, spread } = body;

    if (!universe.length) {
      return NextResponse.json({ error: 'Universe is required' }, { status: 400 });
    }

    const cacheKey = getCacheKey(body);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.result);
    }

    const effectivePeriod = period || (goal === 'preserve' ? '5y' : '3y');
    const effectiveSpread = spread ?? (
      universe.some((t: string) => ['BTC','ETH','SOL','BNB'].includes(t.toUpperCase())) ? 0.75 : 0.15
    );

    const args = [
      '/home/quant/apps/agentx/backtest/engine.py',
      '--universe', universe.join(','),
      '--goal', goal,
      '--rebalance', rebalanceFreq,
      '--period', effectivePeriod,
      '--cash', String(cash),
      '--stop-loss', String(stopLoss),
      '--take-profit', String(takeProfit),
      '--max-position-pct', String(maxPositionPct),
      '--max-positions', String(Math.min(20, universe.length)),
      '--spread', String(effectiveSpread),
    ];

    const result = await new Promise<any>((resolve, reject) => {
      const child = spawn('python3', args, {
        cwd: '/home/quant/apps/agentx',
        env: { ...process.env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Backtest engine failed: ${stderr.slice(0, 300)}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error('Failed to parse backtest output'));
          }
        }
      });
      setTimeout(() => { child.kill(); reject(new Error('Backtest timeout (120s)')) }, 120000);
    });

    cache.set(cacheKey, { result, timestamp: Date.now() });
    // prune old entries
    for (const [k, v] of cache.entries()) {
      if (Date.now() - v.timestamp > CACHE_TTL) cache.delete(k);
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[backtest] Error:', e.message);
    return NextResponse.json({ error: e.message || 'Backtest failed' }, { status: 500 });
  }
}
