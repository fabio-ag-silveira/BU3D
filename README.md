# Batalha Urbana 3D

Remaster web do **BU3D**, a versão 3D do Batalha Urbana feita em C++/OpenGL (GLUT) para a disciplina de Computação Gráfica da UFGD. Segue a mesma linha da [versão 2D remasterizada](https://github.com/fabio-ag-silveira/batalha-urbana-v2): `HTML + CSS + JavaScript modular`, agora com [three.js](https://threejs.org/) para o 3D.

O código C++ original continua em [`legacy/main.cpp`](legacy/main.cpp).

## Como executar

Precisa apenas do Node.js (sem `npm install`: o three.js já vem em `vendor/`).

```bash
node server.js
```

Depois abra `http://127.0.0.1:8000`. Para parar, `Ctrl + C`.

Versão publicada (também no celular): <https://batalha3d.fabiosilveira.dev>

### Publicar no Cloudflare Workers

```bash
npm run deploy
```

O script `scripts/build-worker.mjs` gera `dist-worker/worker.js` com os arquivos do jogo embutidos e o `wrangler` publica no domínio configurado em `wrangler.jsonc`. Para uma pasta estática comum, `npm run build:web` gera `dist/`.

## Como jogar

Cada jogador começa a rodada com 100 HP. Vence a rodada quem destruir o carrinho adversário, e a partida vai para quem vencer 3 rodadas.

| | Elevação do cano | Girar | Andar (ré/frente) | Atirar |
|---|---|---|---|---|
| Player 1 | W/S | A/D | Q/E | segure F e solte |
| Player 2 | I/K | J/L | U/O | segure H e solte |
| Jogador da vez | ↑/↓ | ←/→ | `,`/`.` ou PgDn/PgUp | segure Espaço e solte |

No celular/tablet aparece uma barra de botões embaixo da tela, como na versão 2D: girar, ré, frente, câmera, elevação do cano e Atirar (segure e solte). O botão de menu abre o painel em gaveta e o do canto direito põe em tela cheia. Em pé, o jogo sugere girar o celular. Arrastar na tela gira a câmera livre.

- **Força:** segurar o disparo enche a barra em vai-e-vem; soltar atira. A marca branca mostra a força do tiro anterior.
- **Mira:** a linha pontilhada mostra o começo da trajetória (sem vento) com a força do último tiro, ou a força atual enquanto carrega.
- **Vento:** muda a cada turno e sopra em qualquer direção do plano. A bússola no topo mostra o vento *relativo à câmera* (seta para cima = vento para onde você está olhando). As nuvens e a fumaça seguem o vento.
- **Explosões:** dano em área (acerto direto dá bônus), inclusive em quem atirou.
- **Cidade destrutível:** os prédios são feitos de voxels e cada explosão abre uma cratera esférica. Carrinhos sem apoio caem, e quedas altas causam dano.
- **Movimento:** cada turno tem combustível limitado (barra amarela sob o HP). Dá para descer de um telhado de propósito... e levar dano da queda.
- **Timer:** 25 s por turno. Se acabar durante a carga, o tiro sai com a força atual; senão, a vez passa.
- **Minimapa:** radar que gira com a câmera, com as alturas dos prédios, crateras, os dois carrinhos e a direção da mira.

### Câmeras

`C` troca de câmera (`Shift + C` volta). Também dá para escolher no painel lateral ou no botão CÂM do celular.

| Câmera | Comportamento |
|---|---|
| Perseguição | Atrás do carrinho da vez (como as câmeras dos carrinhos do original), acompanha o projétil e depois olha a explosão. |
| Tática | Do alto, atrás do jogador da vez, enquadrando os dois carrinhos. |
| Visão geral | A câmera "do canto" do original. |
| Topo | A visão de cima do original. |
| Livre | Arraste para girar, botão direito ou `Shift` + arrastar para mover, roda do mouse para zoom. Arrastar ou rolar em qualquer câmera entra nela. |

As câmeras evitam atravessar prédios: se houver um na frente, a câmera se aproxima ou sobe.

### Atalhos

`B` reinicia, `M` alterna IA/local, `N` muda a dificuldade da IA, `X` liga/desliga o som, `C` câmera. O minimapa pode ser desligado no painel.

## O que mudou em relação ao BU3D original

| BU3D (C++/GLUT) | Remaster |
|---|---|
| Velocidade ajustada com W/S, tiro instantâneo | Barra de força: segure e solte |
| Ângulo do cano de −5° a 26°, giro da torre em passos | Elevação contínua de −10° a 85°, giro livre do carrinho |
| Carrinho parado no spawn | Movimento com combustível, quedas com dano |
| 3 acertos ganham a rodada; carrinho escurece a cada acerto | 100 HP, dano em área, acerto direto, fogo amigo; o carrinho escurece e solta fumaça conforme o dano |
| Prédios indestrutíveis | Prédios de voxels com crateras e destroços |
| Sem vento | Vento 3D por turno |
| Colisão por faixas de x **ou** z (acertava sem passar perto) | Hitbox orientada do carrinho e explosão esférica |
| Fundo verde, roxo ou amarelo (caixa fechada) | Temas dia, entardecer e noite com céu, sol/lua, estrelas, nuvens, neblina, sombras e janelas acesas |
| Câmeras fixas trocadas com `c`/`C` | Câmeras suaves, acompanhamento do projétil, câmera livre com mouse, anti-oclusão |
| Só 2 jogadores locais | Versus IA (3 dificuldades) e versus local, com controles de toque no celular |
| Sem som | Efeitos sintetizados com WebAudio |
| Texto em bitmap no canto | Painel lateral, placar sobre o jogo, bússola de vento, barra de força, banners, dano flutuante e minimapa |

A planta da cidade (21 prédios de 20, 30 e 50 de altura) e os spawns são os mesmos do original; foram acrescentados alguns spawns na rua.

## Estrutura

- [src/game.js](src/game.js): estado da partida, fases do turno, entrada, dano e quedas. Não usa DOM.
- [src/ai.js](src/ai.js): IA que busca (giro, elevação, força) simulando trajetórias com vento, prédios e crateras, e lembra dos tiros que erraram.
- [src/world.js](src/world.js): grade de voxels da cidade e crateras (derivada só da lista de crateras).
- [src/physics.js](src/physics.js): trajetória com vento, cano, hitbox, apoio e bloqueio dos carrinhos.
- [src/config.js](src/config.js): constantes de gameplay, planta da cidade, spawns, temas e presets da IA.
- [src/render/](src/render): cena three.js — céu e skyline (`sky.js`), cidade e ruas (`city.js`), carrinhos (`tank.js`), partículas/destroços/explosões (`effects.js`), câmeras (`camera.js`) e a montagem de tudo (`stage.js`).
- [src/overlay.js](src/overlay.js): camada HTML sobre o canvas (placar, timer, vento, força, banners, dano e minimapa).
- [src/hud.js](src/hud.js), [src/input.js](src/input.js), [src/audio.js](src/audio.js): painel lateral, teclado/toque e som.
- [server.js](server.js): servidor HTTP estático para jogar localmente.

O modo LAN da primeira versão foi retirado por enquanto (fica no histórico do git, commit `e3e6223`).

### Coordenadas

O jogo usa as mesmas unidades do BU3D: `y` para cima, chão em `y = 0`, prédios com base 16 × 16 nas posições de `desenha_cidade()`. A convenção de giro é a do three.js: `yaw = 0` aponta para `+z` e `yaw = 90` para `+x`.

## Legado

Para compilar o original no Linux:

```bash
g++ legacy/main.cpp -o BU3D -lGL -lGLU -lglut -lm && ./BU3D
```

Tutorial OpenGL usado na época: <http://www.univasf.edu.br/~jorge.cavalcanti/Tutorial_OpenGL.PDF>

Bianca Andreia e Fabio Amaral Godoy da Silveira — UFGD.
