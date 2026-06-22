import {
  CanvasTexture,
  Color,
  LinearFilter,
  MirroredRepeatWrapping,
  RepeatWrapping,
} from 'three'

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  return { canvas, context }
}

function finishTexture(canvas: HTMLCanvasElement, repeat = 1) {
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

export function createChainLinkTextures() {
  const { canvas, context } = makeCanvas(256)

  context.fillStyle = '#565b72'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (let y = -64; y < 320; y += 64) {
    for (let x = -64; x < 320; x += 96) {
      context.save()
      context.translate(x + 48, y + 32)
      context.rotate(-Math.PI / 4)
      context.strokeStyle = '#bac5ff'
      context.lineWidth = 16
      context.strokeRect(-38, -18, 76, 36)
      context.strokeStyle = '#272c44'
      context.lineWidth = 8
      context.strokeRect(-30, -10, 60, 20)
      context.restore()
    }
  }

  const normalMap = finishTexture(canvas, 7)
  normalMap.wrapS = MirroredRepeatWrapping
  normalMap.wrapT = MirroredRepeatWrapping

  const emissiveSource = makeCanvas(256)
  emissiveSource.context.drawImage(canvas, 0, 0)
  emissiveSource.context.globalCompositeOperation = 'source-in'
  emissiveSource.context.fillStyle = '#a873ff'
  emissiveSource.context.fillRect(0, 0, 256, 256)
  const emissiveMap = finishTexture(emissiveSource.canvas, 7)

  return { normalMap, emissiveMap }
}

export function createCircuitTexture() {
  const { canvas, context } = makeCanvas(256)

  context.fillStyle = '#02020b'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.lineCap = 'round'
  context.globalAlpha = 0.72

  for (let y = 24; y < 256; y += 42) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(60, y)
    context.lineTo(60, y + 18)
    context.lineTo(132, y + 18)
    context.lineTo(132, y - 12)
    context.lineTo(256, y - 12)
    context.stroke()
  }

  context.globalAlpha = 0.95
  context.fillStyle = '#ffffff'
  for (let y = 30; y < 256; y += 42) {
    for (let x = 28; x < 256; x += 72) {
      context.beginPath()
      context.arc(x, y, 5, 0, Math.PI * 2)
      context.fill()
    }
  }

  return finishTexture(canvas, 3)
}

type PlanetKind = 'defi' | 'token' | 'nft' | 'other'

const planetPalettes: Record<
  PlanetKind,
  {
    base: string
    accent: string
    dark: string
    glow: string
  }
> = {
  defi: {
    base: '#7c3dcc',
    accent: '#d7a5ff',
    dark: '#32124f',
    glow: '#9b3fff',
  },
  token: {
    base: '#1c91c8',
    accent: '#a8fff5',
    dark: '#0b3568',
    glow: '#28ffe7',
  },
  nft: {
    base: '#2ba466',
    accent: '#a6ffb6',
    dark: '#164827',
    glow: '#39ff88',
  },
  other: {
    base: '#8e929e',
    accent: '#e3d9cb',
    dark: '#3d414d',
    glow: '#ff6f61',
  },
}

function noise(x: number, y: number, seed: number) {
  return (
    Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453123
  ) % 1
}

function mixedColor(a: string, b: string, amount: number) {
  return new Color(a).lerp(new Color(b), amount).getStyle()
}

function drawGasGiant(
  context: CanvasRenderingContext2D,
  size: number,
  palette: (typeof planetPalettes)['defi'],
) {
  for (let y = 0; y < size; y += 1) {
    const band =
      0.5 +
      Math.sin(y * 0.065) * 0.24 +
      Math.sin(y * 0.19 + 1.7) * 0.11
    context.fillStyle = mixedColor(palette.dark, palette.accent, band)
    context.fillRect(0, y, size, 1)
  }

  context.globalAlpha = 0.22
  for (let i = 0; i < 90; i += 1) {
    const y = Math.random() * size
    context.strokeStyle = i % 3 === 0 ? palette.accent : palette.base
    context.lineWidth = 1 + Math.random() * 3
    context.beginPath()
    context.moveTo(0, y)
    for (let x = 0; x <= size; x += 18) {
      context.lineTo(x, y + Math.sin(x * 0.025 + i) * 9)
    }
    context.stroke()
  }
  context.globalAlpha = 1
}

function drawOceanWorld(
  context: CanvasRenderingContext2D,
  size: number,
  palette: (typeof planetPalettes)['token'],
) {
  const gradient = context.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, palette.dark)
  gradient.addColorStop(0.52, palette.base)
  gradient.addColorStop(1, palette.accent)
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

  context.globalAlpha = 0.62
  for (let i = 0; i < 34; i += 1) {
    context.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.72)' : '#9ffff5'
    context.beginPath()
    const x = Math.random() * size
    const y = Math.random() * size
    context.ellipse(
      x,
      y,
      36 + Math.random() * 96,
      8 + Math.random() * 22,
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    )
    context.fill()
  }
  context.globalAlpha = 1
}

function drawVerdantWorld(
  context: CanvasRenderingContext2D,
  size: number,
  palette: (typeof planetPalettes)['nft'],
) {
  context.fillStyle = palette.dark
  context.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const value =
        0.48 +
        noise(x * 0.015, y * 0.015, 4) * 0.32 +
        Math.sin((x + y) * 0.025) * 0.16
      context.fillStyle =
        value > 0.52
          ? mixedColor(palette.base, palette.accent, Math.min(1, value - 0.32))
          : mixedColor('#12355f', palette.base, value)
      context.fillRect(x, y, 5, 5)
    }
  }

  context.globalAlpha = 0.34
  context.fillStyle = 'rgba(255,255,255,0.72)'
  for (let i = 0; i < 24; i += 1) {
    context.beginPath()
    context.ellipse(
      Math.random() * size,
      Math.random() * size,
      28 + Math.random() * 64,
      10 + Math.random() * 28,
      Math.random() * Math.PI,
      0,
      Math.PI * 2,
    )
    context.fill()
  }
  context.globalAlpha = 1
}

function drawRockyWorld(
  context: CanvasRenderingContext2D,
  size: number,
  palette: (typeof planetPalettes)['other'],
) {
  context.fillStyle = palette.dark
  context.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y += 3) {
    for (let x = 0; x < size; x += 3) {
      const value = 0.3 + Math.abs(noise(x * 0.03, y * 0.03, 9)) * 0.7
      context.fillStyle = mixedColor(palette.dark, palette.accent, value)
      context.fillRect(x, y, 4, 4)
    }
  }

  for (let i = 0; i < 44; i += 1) {
    const radius = 4 + Math.random() * 20
    const x = Math.random() * size
    const y = Math.random() * size
    context.strokeStyle = 'rgba(20,20,25,0.48)'
    context.lineWidth = Math.max(1, radius * 0.16)
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = 'rgba(255,235,220,0.12)'
    context.beginPath()
    context.arc(x - radius * 0.25, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2)
    context.fill()
  }
}

function drawCityLights(
  context: CanvasRenderingContext2D,
  size: number,
  color: string,
) {
  context.clearRect(0, 0, size, size)
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 2
  context.globalAlpha = 0.76

  for (let y = 24; y < size; y += 48) {
    context.beginPath()
    context.moveTo(0, y)
    for (let x = 0; x <= size; x += 40) {
      context.lineTo(x, y + Math.sin(x * 0.08 + y) * 12)
    }
    context.stroke()
  }

  context.globalAlpha = 0.92
  for (let i = 0; i < 150; i += 1) {
    context.beginPath()
    context.arc(Math.random() * size, Math.random() * size, 1.4, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
}

export function createPlanetTextureSet(kind: PlanetKind) {
  const palette = planetPalettes[kind]
  const surface = makeCanvas(512)
  const lights = makeCanvas(512)

  if (kind === 'defi') {
    drawGasGiant(surface.context, surface.canvas.width, palette)
  } else if (kind === 'token') {
    drawOceanWorld(surface.context, surface.canvas.width, palette)
  } else if (kind === 'nft') {
    drawVerdantWorld(surface.context, surface.canvas.width, palette)
  } else {
    drawRockyWorld(surface.context, surface.canvas.width, palette)
  }

  drawCityLights(lights.context, lights.canvas.width, palette.glow)

  return {
    cityLightsMap: finishTexture(lights.canvas, 1),
    surfaceMap: finishTexture(surface.canvas, 1),
  }
}
