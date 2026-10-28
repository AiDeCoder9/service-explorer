import { mockResponse } from '@/server/mock';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => mockResponse(request, (d) => d.providers, 200);
