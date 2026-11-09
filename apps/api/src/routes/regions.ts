import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

type Position = [number, number];
type Ring = Position[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type Geometry =
  | { type: 'Polygon'; coordinates: Polygon }
  | { type: 'MultiPolygon'; coordinates: MultiPolygon };
type RegionFeature = {
  type: 'Feature';
  properties: { name: string };
  geometry: Geometry;
};
type RegionCollection = { type: 'FeatureCollection'; features: RegionFeature[] };

const canonicalNames = [
  'Bosque', 'Central', 'CEU', 'Cidade da Criança', 'HB',
  'Pinheirinho', 'Represa', 'Schmitt', 'Talhado', 'Vila Toninho',
];

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/\bregiao\b|\bengenheiro\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function regionName(value: string) {
  const input = normalize(value);
  if (input === 'schimitt') return 'Schmitt';
  const found = canonicalNames.find((name) => normalize(name) === input);
  return found ?? null;
}

function parsePosition(input: unknown, counter: { vertices: number }): Position {
  if (!Array.isArray(input) || input.length < 2) throw Error('Coordenadas inválidas');
  const [longitude, latitude] = input;
  if (typeof longitude !== 'number' || typeof latitude !== 'number'
      || !Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -50.3 || longitude > -48.8
      || latitude < -21.4 || latitude > -20.0) {
    throw Error('Coordenadas fora de São José do Rio Preto. Exporte o GeoJSON no sistema WGS84 / EPSG:4326.');
  }
  counter.vertices++;
  if (counter.vertices > 150_000) throw Error('Malha muito detalhada; simplifique a geometria antes de importar.');
  return [longitude, latitude];
}

function parsePolygon(value: unknown, counter: { vertices: number }): Polygon {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) {
    throw Error('Polígono inválido');
  }
  return value.map((ringValue) => {
    if (!Array.isArray(ringValue) || ringValue.length < 4) throw Error('Anel de polígono inválido');
    const ring = ringValue.map((point) => parsePosition(point, counter));
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw Error('Os polígonos precisam ter anéis fechados');
    }
    return ring;
  });
}

function parseGeometry(input: unknown, counter: { vertices: number }): Geometry {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Geometria inválida');
  const geometry = input as Record<string, unknown>;
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: parsePolygon(geometry.coordinates, counter) };
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0 && geometry.coordinates.length <= 1000) {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => parsePolygon(polygon, counter)),
    };
  }
  throw Error('A camada deve conter somente Polygon ou MultiPolygon');
}

function parseCollection(input: unknown): RegionCollection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Arquivo GeoJSON inválido');
  const raw = input as Record<string, unknown>;
  if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)
    || raw.features.length < 10 || raw.features.length > 500) {
    throw Error('Envie um FeatureCollection GeoJSON com as 10 regiões (até 500 polígonos).');
  }
  const names = new Set<string>();
  const counter = { vertices: 0 };
  const features = raw.features.map((entry): RegionFeature => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error('Feature inválida');
    const feature = entry as Record<string, unknown>;
    if (feature.type !== 'Feature') throw Error('Elemento não é uma Feature GeoJSON');
    const props = feature.properties;
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      throw Error('Feature sem propriedades');
    }
    const properties = props as Record<string, unknown>;
    const alias = [
      'name', 'nome', 'NOME', 'REGIAO', 'Regiao', 'regiao', 'NM_REGIAO',
      'nm_regiao', 'REGIÃO', 'NM_REGIÃO', 'Nome', 'REGION',
    ].map((key) => properties[key]).find((value) => typeof value === 'string');
    const name = typeof alias === 'string' ? regionName(alias) : null;
    if (!name) throw Error(`Nome de região não reconhecido: ${String(alias ?? 'ausente')}`);
    names.add(name);
    return { type: 'Feature', properties: { name }, geometry: parseGeometry(feature.geometry, counter) };
  });

  if (names.size !== 10 || canonicalNames.some((name) => !names.has(name))) {
    throw Error(`A malha precisa conter todas as 10 regiões. Encontradas: ${[...names].join(', ')}`);
  }
  return { type: 'FeatureCollection', features };
}

export async function regionRoutes(app: FastifyInstance) {
  app.get('/regions', async () => {
    const saved = await prisma.regionMap.findUnique({ where: { id: 'sjrp-10' } });
    return {
      available: Boolean(saved),
      source: saved?.source ?? null,
      updatedAt: saved?.updatedAt ?? null,
      geojson: saved?.geojson ?? null,
      names: canonicalNames,
    };
  });

  app.post('/regions/import', { bodyLimit: 8_000_000 }, async (request, reply) => {
    const body = z.object({
      geojson: z.unknown(),
      source: z.string().trim().max(500).optional(),
    }).parse(request.body);

    let collection: RegionCollection;
    try {
      collection = parseCollection(body.geojson);
    } catch (err) {
      return reply.code(400).send({ message: err instanceof Error ? err.message : 'GeoJSON inválido' });
    }

    const saved = await prisma.regionMap.upsert({
      where: { id: 'sjrp-10' },
      update: { geojson: JSON.parse(JSON.stringify(collection)), source: body.source ?? null, updatedBy: request.adminUser!.username },
      create: { id: 'sjrp-10', geojson: JSON.parse(JSON.stringify(collection)), source: body.source ?? null, updatedBy: request.adminUser!.username },
    });
    await prisma.event.create({
      data: {
        type: 'REGION_MAP_IMPORTED', severity: 'INFO',
        message: `Mapa com 10 regiões atualizado por ${request.adminUser!.username}`,
        metadata: { regionCount: 10, polygonCount: collection.features.length },
      },
    });
    reply.code(201);
    return { ok: true, regionCount: 10, polygonCount: collection.features.length, updatedAt: saved.updatedAt };
  });
}
