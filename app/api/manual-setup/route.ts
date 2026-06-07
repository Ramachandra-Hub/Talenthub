import { NextRequest, NextResponse } from 'next/server';
import { guardSetupRoute } from '@/lib/setup/guard-setup-route';
import { forwardSetupHeaders } from '@/lib/setup/forward-setup-headers';

export async function POST(request: NextRequest) {
  const denied = await guardSetupRoute(request);
  if (denied) return denied;

  try {
    console.log('Manual setup started');

    // Initialize database
    const setupHeaders = forwardSetupHeaders(request);
    const initUrl = new URL('/api/setup/init-direct', request.url);
    const initResponse = await fetch(initUrl.toString(), {
      method: 'POST',
      headers: setupHeaders,
    });
    const initData = await initResponse.json();
    console.log('Init response:', initData);

    if (!initResponse.ok) {
      return NextResponse.json({
        success: false,
        step: 'initialization',
        error: initData.error || 'Database initialization failed'
      }, { status: 400 });
    }

    // Seed database
    const seedUrl = new URL('/api/setup/seed-direct', request.url);
    const seedResponse = await fetch(seedUrl.toString(), {
      method: 'POST',
      headers: setupHeaders,
    });
    const seedData = await seedResponse.json();
    console.log('Seed response:', seedData);

    if (!seedResponse.ok) {
      return NextResponse.json({
        success: false,
        step: 'seeding',
        error: seedData.error || 'Database seeding failed'
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Database setup complete',
      initialization: initData,
      seeding: seedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual setup error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Setup failed'
    }, { status: 500 });
  }
}
