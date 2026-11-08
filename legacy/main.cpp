/**************************************************
  Universidade Federal da Grande Dourados - UFGD
  Trabalho Computacao Grafica - Batalha Urbana 3D
  Bianca Andreia, Fabio Amaral Godoy da Silveira
**************************************************/

#include <GL/glut.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <math.h>
#include <time.h>
#define PI 3.14159265   // Pi.
#define G 9.81          // Gravidade.


void texto();
void tiro_1();
void tiro_2();
void trajetoria_balistica_1();
void trajetoria_balistica_2();
void nova_rodada();


char buf_1[100] = {0};

float tam = 3.5f, Tempo = 0,
      R = 20, L = -27, I = -12, K = 6, A = -15, // Variaveis para movimentar a camera livre.
      r, g, b,                   	            // Para a cor do fundo.
      c1_cor = 1,                	            // Para a cor do Carrinho 1.
      c2_cor = 1,                	            // Para a cor do Carrinho 2.
      c1_1, c1_2, c2_1, c2_2,    	            // Coordenadas de spawn dos carrinhos.
      c1_3, c2_3;

int n1, n2, numero_aleatorio,                   // Numeros aleatorios para cor de fundo e posicão de spawn dos carrinhos.
    jogada = 0, rodada = 0, ponto1 = 0,         // Variaveis contadoras.
    ponto2 = 0, ponto_1 = 0, ponto_2 = 0,
    cam = 3,                                    // Posicao inicial da camera.
    Velocidade_1 = 30, Velocidade_2 = 30,       // Velocidade inicial dos projeteis dos canhoes.
    angulo_1 = 2, angulo_1a = 2,                // Angulos iniciais dos canhoes.
    angulo_2 = 2, angulo_2a = 2;

bool bola1 = false, bola2 = false, colisao1 = false, colisao2 = false, vez1 = false, vez2 = false;

// Ajusta o tamanho da janela.
void Atualiza_Tamanho(int w, int h)
{
    glViewport(0, 0, w, h);
    float aspect = (float)w / (float)h;

    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(90.0, aspect, 0.1, 500.0);

    glMatrixMode(GL_MODELVIEW);
}

void desenha(float p1[3], float p2[3], float p3[3], float p4[3])
{
    glBegin(GL_QUADS);
    glVertex3fv(p1);
    glVertex3fv(p2);
    glVertex3fv(p3);
    glVertex3fv(p4);
    glEnd();

    glColor3f(0,0,0);
    glBegin(GL_LINE_LOOP);
    glVertex3fv(p1);
    glVertex3fv(p2);
    glVertex3fv(p3);
    glVertex3fv(p4);
    glEnd();
}

// Funcao para desenhar blocos.
int bloco(float c, float l, float p, float cor1, float cor2, float cor3)
{
    float v1[3] = {-c, l,  p},
          v2[3] = {-c, 0,  p},
          v3[3] = { c, 0,  p},
          v4[3] = { c, l,  p};

    float v5[3] = { c, l, -p},
          v6[3] = { c, 0, -p},
          v7[3] = {-c, 0, -p},
          v8[3] = {-c, l, -p};

    //Face 1 - Frente
    glColor3f(cor1,cor2,cor3);
    desenha(v1,v2,v3,v4);

    //Face 2 - Direita
    glColor3f(cor1,cor2,cor3);
    desenha(v3,v4,v5,v6);

    //Face 3 - Tras
    glColor3f(cor1,cor2,cor3);
    desenha(v5,v6,v7,v8);

    //Face 4 - Esquerda
    glColor3f(cor1,cor2,cor3);
    desenha(v1,v2,v7,v8);

    //Face 5 - Topo
    glColor3f(cor1,cor2,cor3);
    desenha(v1,v4,v5,v8);

    //Face 6 - Baixo
    glColor3f(cor1,cor2,cor3);
    desenha(v2,v3,v6,v7);

    return 0;
}

// Desenha um circulo e seu contorno.
void eixo()
{
    float teta = 0.0f, teta2 = 0.1, raio = 1.0;

    glBegin(GL_POLYGON);
    while(teta < 360.0)
    {
        glVertex2f(1.5*cos(teta/180.0 * PI),1.5*sin(teta/180.0 * PI));
        teta += 0.1;
    }
    glEnd();

    glBegin(GL_LINES);
    while(teta2 < 360.0)
    {
        raio = 1.5;
        glColor3f(0.0f, 0.0f, 0.0f);
        glVertex2f((cos(teta2) * raio),(sin(teta2) * raio));
        raio = 1.2;

        glVertex2f((cos(teta2) * raio),(sin(teta2) * raio));
        teta2 +=1.0;
    }
    glEnd();
}

// Desenha um cilindro
int cilindro(float raio, float comprimento)
{
    GLUquadricObj *quadratic;
    quadratic = gluNewQuadric();
    gluCylinder(quadratic, raio, raio, comprimento, 32, 32);
    return 0;
}

// Desenha uma esfera.
void bomba()
{
    glutSolidSphere(1,10,10);
}

// Desenha o tank do Player 1.
void desenha_carrinho_1()
{
    // Base
    glPushMatrix();
    glTranslatef(0,0,0);
    bloco(4,3,6,0.2*c1_cor,0.2*c1_cor,0.5*c1_cor);
    glPopMatrix();

    // Rodas
    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,0);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,3.5);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,-3.5);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    // Cima
    glPushMatrix();
    glTranslatef(0,3,0);
    glRotatef(angulo_1a,0,1,0);
    bloco(3,2,3,0.3,0.3,0.5);

    // Cano
    glColor3f(0.0,0.0,0.0);
    glTranslatef(0,1,0);
    glRotatef(angulo_1*(-1),1,0,0);
    cilindro(0.5,10);
    glPopMatrix();

    glPushMatrix();
    glRotatef(angulo_1a,0,1,0);
    glTranslatef(0,2,0);
    glRotatef(-90,0,1,0);
    glColor3f(0,0,1);

    trajetoria_balistica_1();

    if(bola1 == true)
    {
        tiro_1();
    }
    glPopMatrix();
}

// Desenha o tank do Player 2.
void desenha_carrinho_2()
{
    // Base
    glPushMatrix();
    glTranslatef(0,0,0);
    bloco(4,3,6,0.5*c2_cor,0.2*c2_cor,0.2*c2_cor);
    glPopMatrix();

    // Rodas
    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,0);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,3.5);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    glPushMatrix();
    glColor3f(0,0,0);
    glTranslatef(-5,0.3,-3.5);
    glRotatef(90,0,1,0);
    cilindro(1.5,10);
    eixo();
    glTranslatef(0,0,10);
    eixo();
    glPopMatrix();

    // Cima
    glPushMatrix();
    glTranslatef(0,3,0);
    glRotatef(angulo_2a,0,1,0);
    bloco(3,2,3,0.5,0.1,0.1);

    // Cano
    glColor3f(0.0,0.0,0.0);
    glTranslatef(0,1,0);
    glRotatef(angulo_2*(-1),1,0,0);
    cilindro(0.5,10);
    glPopMatrix();

    glPushMatrix();
    glRotatef(angulo_2a,0,1,0);
    glTranslatef(0,2,0);
    glRotatef(-90,0,1,0);
    glColor3f(1,0,0);

    trajetoria_balistica_2();

    if(bola2 == true)
    {
        tiro_2();
    }
    glPopMatrix();
}

// Posicoes de spawn do carrinho 1.
void spawn_carrinho_1()
{
    glPushMatrix();

    switch(n1)
    {
    case 0:
        // Posicao 1.
        glTranslatef(-30.0f,21.0f,75.0f);
        c1_1 = -30.0f;
        c1_2 = 21.0f;
        c1_3 = 75.0f;
        desenha_carrinho_1();
        break;

    case 1:
        // Posicao 2.
        glTranslatef(-60.0f,21.0f,75.0f);
        c1_1 = -60.0f;
        c1_2 = 21.0f;
        c1_3 = 75.0f;
        desenha_carrinho_1();
        break;

    case 2:
        // Posicao 3.
        glTranslatef(-120.0f,21.0f,105.0f);
        c1_1 = -120.0f;
        c1_2 = 21.0f;
        c1_3 = 105.0f;
        desenha_carrinho_1();
        break;

    case 3:
        // Posicao 4.
        glTranslatef(-60.0f,21.0f,135.0f);
        c1_1 = -60.0f;
        c1_2 = 21.0f;
        c1_3 = 135.0f;
        desenha_carrinho_1();
        break;
    }
    glPopMatrix();
}

// Posicoes de spawn do carrinho 2.
void spawn_carrinho_2()
{
    glPushMatrix();

    switch(n2)
    {
    case 0:
        // Posicao 1.
        glTranslated(0.0f,21.0f,45.0f);
        c2_1 = 0.0f;
        c2_2 = 21.0f;
        c2_3 = 45.0f;
        desenha_carrinho_2();
        break;

    case 1:
        // Posicao 2.
        glTranslated(0.0f,21.0f,105.0f);
        c2_1 = 0.0f;
        c2_2 = 21.0f;
        c2_3 = 105.0f;
        desenha_carrinho_2();
        break;

    case 2:
        // Posicao 3.
        glTranslated(-120.0f,31.0f,15.0f);
        c2_1 = -120.0f;
        c2_2 = 31.0f;
        c2_3 = 15.0f;
        desenha_carrinho_2();
        break;

    case 3:
        // Posicao 4.
        glTranslated(30.0f,31.0f,135.0f);
        c2_1 = 30.0f;
        c2_2 = 31.0f;
        c2_3 = 135.0f;
        desenha_carrinho_2();
        break;
    }
    glPopMatrix();
}

// Predio medio.
void desenha_predio_maior()
{
    glPushMatrix();
    bloco(8,30,8,0.1,0.1,0.1);
    glPopMatrix();
}

// Predio pequeno.
void desenha_predio_menor()
{
    glPushMatrix();
    bloco(8,20,8,0.2,0.2,0.2);
    glPopMatrix();
}

// Predio mais alto.
void desenha_predio_alto()
{
    glPushMatrix();
    bloco(8,50,8,0.5,0.5,0.5);
    glPopMatrix();
}

// Desenha os limites do universo.
void paredes_piso()
{
    glPushMatrix(); // Chao.
    glTranslated(-50,-2.5,70);
    bloco(120,2.2,120,0.15,0.15,0.15);
    glPopMatrix();

    glPushMatrix(); // Fundo.
    glTranslated(-50,0,170);
    bloco(100,100,2,r,g,b);
    glPopMatrix();

    glPushMatrix(); // Tras.
    glTranslated(-50,0,-7);
    bloco(100,100,2,r,g,b);
    glPopMatrix();

    glPushMatrix(); // Direita.
    glTranslated(-152.2,0,70);
    bloco(2,100,100,r,g,b);
    glPopMatrix();

    glPushMatrix(); // Esquerda.
    glTranslated(52.2,0,70);
    bloco(2,100,100,r,g,b);
    glPopMatrix();

    glPushMatrix(); // Teto.
    glTranslated(-50,100.2,70);
    bloco(120,2.2,120,r*1.5,g*0.8,b);
    glPopMatrix();
}

void desenha_cidade()
{
    glPushMatrix();
    glTranslatef(0,0,30*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(0,0,50*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(0,0,70*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(0,0,90*1.5);
    desenha_predio_maior();
    glPopMatrix();


    glPushMatrix();
    glTranslatef(20*1.5,0,30*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(20*1.5,0,50*1.5);
    desenha_predio_alto();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(20*1.5,0,70*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(20*1.5,0,90*1.5);
    desenha_predio_maior();
    glPopMatrix();


    glPushMatrix();
    glTranslatef(-20*1.5,0,10*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-20*1.5,0,30*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-20*1.5,0,50*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-20*1.5,0,70*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-20*1.5,0,90*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-40*1.5,0,90*1.5);
    desenha_predio_menor();
    glPopMatrix();


    glPushMatrix();
    glTranslatef(-40*1.5,0,30*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-40*1.5,0,50*1.5);
    desenha_predio_menor();
    glPopMatrix();


    glPushMatrix();
    glTranslatef(-80*1.5,0,10*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-80*1.5,0,30*1.5);
    desenha_predio_maior();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-80*1.5,0,50*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-80*1.5,0,70*1.5);
    desenha_predio_menor();
    glPopMatrix();

    glPushMatrix();
    glTranslatef(-80*1.5,0,90*1.5);
    desenha_predio_alto();
    glPopMatrix();
}

void camera_livre()
{
    glRotated(20+I,1,0,0);
    glRotated(210+K,0,1,0);
    glTranslated(L,A-25,-20+R);
    //printf("\nI:%f\nK:%f\nL:%f\nR:%f\nA:%f\n",I,K,L,R,A);
}

// Visao de cima.
void camera2()
{
    glRotated(90,1,0,0);
    glRotated(180,0,1,0);
    glTranslated(27,-100,-68);
}

// Camera do canto.
void camera3()
{
    glRotated(56,1,0,0);
    glRotated(340,0,1,0);
    glTranslated(0,-90,-140);
}

// Camera do carrinho 1.
void camera_c1()
{
    glRotated(10,1,0,0);
    glRotated(180+(angulo_1a*(-1)),0,1,0);
    glTranslated(-c1_1,-c1_2-10,-c1_3);
}

// Camera do carrinho 2.
void camera_c2()
{
    glRotated(10,1,0,0);
    glRotated(180+(angulo_2a*(-1)),0,1,0);
    glTranslated(-c2_1,-c2_2-10,-c2_3);
}

void muda_camera(int cam)
{
    switch(cam)
    {
    case 0:
        camera_livre();
        break;

    case 1:
        camera2();
        break;

    case 2:
        camera3();
        break;

    case 3:
        camera_c1();
        break;

    case 4:
        camera_c2();
        break;
    }
}

void Atualiza_Desenho(void)
{
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glLoadIdentity();

    glPushMatrix();
    glTranslated(0.0,0.0,-5.0);
    texto();            //Mostra o texto na tela.
    glPopMatrix();

    muda_camera(cam);   // Cameras.

    glPushMatrix();
    paredes_piso();     // Desenha os limites do universo.
    desenha_cidade();   // Desenha cidade.
    spawn_carrinho_1(); // Desenha carrinhos.
    spawn_carrinho_2();
    glPopMatrix();

    glutPostRedisplay();
    glutSwapBuffers();
}

void nova_rodada()
{
    srand(time(NULL));
    // Gera numeros aleatorios de 0 a 3, para definir as novas posicoes dos carrinhos.
    n1 = rand()%4;
    n2 = rand()%4;

    ponto1 = 0;
    ponto2 = 0;
    jogada = 0;

    if(jogada%2 == 0)
    {
        cam = 3;
        muda_camera(cam);
    }
    if(jogada%2 != 0)
    {
        cam = 4;
        muda_camera(cam);
    }

    numero_aleatorio = rand()%3;

    if(numero_aleatorio == 0)   // Se o numero e 0, o fundo e verde.
    {
        r = 0.0;
        g = 0.5;
        b = 0.5;
    }
    if(numero_aleatorio == 1)   // Se o numero e 1, o fundo e roxo.
    {
        r = 0.5;
        g = 0.5;
        b = 1.0;
    }
    if(numero_aleatorio == 2)   // Se o numero e 2, o fundo e amarelo.
    {
        r = 0.5;
        g = 0.5;
        b = 0.0;
    }

    c1_cor = 1;
    c2_cor = 1;

    vez1 = false;
    vez2 = false;

    rodada++;
}

void vez_jogada()
{
    jogada++;   // Incrementa o numero da jogada.

    if(jogada%2 == 0)
    {
        cam = 3;
        muda_camera(cam);
    }
    if(jogada%2 != 0)
    {
        cam = 4;
        muda_camera(cam);
    }
}

void tempo(int value)
{
    Tempo += 0.01;   // O tempo para utilizar na equacao de lancamento obliquo.
    glutPostRedisplay();
}

void LeTeclado(unsigned char tecla, int x, int y)
{

    switch (tecla)
    {
    case 'W':
        R-=3;   // Rotaciona objeto.
        break;

    case 'A':
        L-=3;   // Rotaciona objeto.
        break;

    case 'S':
        R+=3;   // Rotaciona objeto.
        break;

    case 'D':
        L+=3;   // Rotaciona objeto.
        break;

    case 'I':
        I-=3;   // Rotaciona objeto.
        break;

    case 'J':
        K-=3;   // Rotaciona objeto.
        break;

    case 'K':
        I+=3;   // Rotaciona objeto.
        break;

    case 'L':
        K+=3;   // Rotaciona objeto.
        break;

    case 'Z':
        A+=3;   // Rotaciona objeto.
        break;

    case 'z':
        A-=3;   // Rotaciona objeto.
        break;

    case 'c':         // Passa para a proxima camera.
        if(cam <= 3)
        {
            cam = cam + 1;
            muda_camera(cam);
            glutPostRedisplay();
        }
        break;

    case 'C':         // Volta para a camera anterior.
        if(cam >= 2)  // (cam >= 4) para ativar a camera livre.
        {
            cam = cam - 1;
            muda_camera(cam);
            glutPostRedisplay();
        }
        break;
    case 'Q':
        // Sai do jogo.
        exit(0);
        break;

    case 'b':
        // Novo jogo.
        nova_rodada();
        ponto_1 = 0;
        ponto_2 = 0;
        rodada = 0;
        bola1 = false;
        bola2 = false;
        glLoadIdentity();
        glutPostRedisplay();
        break;
    }


    if(jogada%2 == 0)   // Se a jogada for par, e a vez do Player 1.
    {
        switch (tecla)
        {

//########################## CONTROLES PLAYER 1 ##########################
        // Movimenta o cano do canhao 1.
        case 'd':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Incrementa em 2 o angulo se nao estiver no limite.
                if(angulo_1 <= 24) angulo_1 = angulo_1 + 2;
                glutPostRedisplay();
            }
            break;

        case 'a':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Decrementa em 2 o angulo se nao estiver no limite.
                if(angulo_1 >= -5) angulo_1 = angulo_1 - 2;
                glutPostRedisplay();
            }
            break;

        case 'q':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Incrementa em 3 o angulo se nao estiver no limite.
                if(angulo_1a <= 180) angulo_1a = angulo_1a + 3;
                glutPostRedisplay();
            }
            break;

        case 'e':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Decrementa em 3 o angulo se nao estiver no limite.
                if(angulo_1a >= -180) angulo_1a = angulo_1a - 3;
                glutPostRedisplay();
            }
            break;

        case 'w':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Incrementa em 1 a velocidade do canhao 1.
                if(Velocidade_1 <= 199) Velocidade_1 = Velocidade_1 + 1;
                glutPostRedisplay();
            }
            break;

        case 's':
            if(vez1 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Decrementa em 1 a velocidade do canhao 1.
                if(Velocidade_1 >= 30) Velocidade_1 = Velocidade_1 - 1;
                glutPostRedisplay();
            }
            break;

        case 'f':
            // Atira com o canhao 1.
            vez1 = true;
            vez2 = false;
            bola1 = true;
            if(bola1)
            {
                glutPostRedisplay();
            }
            break;
        }
    }

    if(jogada%2 != 0)   // Se a jogada for impar, e a vez do Player 2.
    {
        switch (tecla)
        {
//########################## CONTROLES PLAYER 2 ##########################
        // Movimenta o cano do canhao 2.
        case 'l':
            if(vez2 == false) // Condicao para bloquear os controles do carrinho 2 enquanto o projetil estiver no ar.
            {
                // Incrementa em 2 o angulo se nao estiver no limite.
                if(angulo_2 <= 24) angulo_2 = angulo_2 + 2;
                glutPostRedisplay();
            }
            break;

        case 'j':
            if(vez2 == false)   // Condicao para bloquear os controles do carrinho 2 enquanto o projetil estiver no ar.
            {
                // Decrementa em 2 o angulo se nao estiver no limite.
                if(angulo_2 >= -5) angulo_2 = angulo_2 - 2;
                glutPostRedisplay();
            }
            break;

        case 'u':
            if(vez2 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Incrementa em 3 o angulo se nao estiver no limite.
                if(angulo_2a <= 180) angulo_2a = angulo_2a + 3;
                glutPostRedisplay();
            }
            break;

        case 'o':
            if(vez2 == false)   // Condicao para bloquear os controles do carrinho 1 enquanto o projetil estiver no ar.
            {
                // Decrementa em 3 o angulo se nao estiver no limite.
                if(angulo_2a >= -180) angulo_2a = angulo_2a - 3;
                glutPostRedisplay();
            }
            break;

        case 'i':
            if(vez2 == false)   // Condicao para bloquear os controles do carrinho 2 enquanto o projetil estiver no ar.
            {
                // Incrementa em 1 a velocidade do canhao 2.
                if(Velocidade_2 <= 199) Velocidade_2 = Velocidade_2 + 1;
                glutPostRedisplay();
            }
            break;

        case 'k':
            if(vez2 == false)   // Condicao para bloquear os controles do carrinho 2 enquanto o projetil estiver no ar.
            {
                // Decrementa em 1 a velocidade do canhao 2.
                if(Velocidade_2 >= 30) Velocidade_2 = Velocidade_2 - 1;
                glutPostRedisplay();
            }
            break;

        case 'h':
            // Atira com o canhao 2.
            vez1 = false;
            vez2 = true;
            bola2 = true;
            if(bola2)
            {
                glutPostRedisplay();
            }
            break;
        }
    }
}

void tiro_1()
{
    float Voy = Velocidade_1 * sin((angulo_1)/180.0 * PI),
          Vox = Velocidade_1 * cos((angulo_1)/180.0 * PI),

          x = Vox * Tempo,
          y = Voy * Tempo - G * Tempo * Tempo / 2,

          posicao_x = 0.0 + x,
          posicao_y = 2.0 + y; // Posicao (x,y) do projetil.

    // Mostra a trajetoria do projetil durante o tiro.
    if(bola1 == true)
    {
        trajetoria_balistica_1();
    }

    // Limites para +x, -x e -y para a posicao do projetil.
    if(posicao_x >= -400.00 && posicao_y >= -50.00 && posicao_x <= 400.00)
    {
        glTranslatef(posicao_x, posicao_y, 0.0);
        bomba();
        glutTimerFunc(30, tempo, 0);

        printf("\n C2_1: %.2f, x+C1_1: %.2f\n C2_3: %.2f, x+C1_3: %.2f\n",c2_1,posicao_x+c1_1,c2_3,posicao_x+c1_3);
        printf("\n C1_1: %.2f\n C1_3: %.2f\n",c1_1,c1_3);
        // Verifica se acertou o carrinho 2.
        //((x >= cx_1-tam && x <= cx_1+tam) || (z >= cz_3-tam && z <= cz_3+tam)) && (y >= cy_2-tam && y <= c2_2+tam)

        if(((posicao_x+c1_1 >= c2_1-2.5 && posicao_x+c1_1 <= c2_1+2.5)
            ||(posicao_x+c1_3 >= c2_3-2.5 && posicao_x+c1_3 <= c2_3+2.5))
            && (posicao_y+c1_2 >= c2_2-3.5 && posicao_y+c1_2 <= c2_2+3.5))
        {
            colisao1 = true;
            ponto1++;   // Pontuacao para alterar a cor do carrinho.
            ponto_1++;  // Pontuacao para mostrar na tela.
            bola1 = false;  // Sai da condicao de tiro.

            Tempo = 0;
            vez_jogada();   // Alterna jogada.

            if(ponto1 == 1)
            {
                c2_cor = 0.5; // O Carrinho 2 muda de cor ao ser atingido.
                srand(time(NULL));
                // Gera numeros aleatorios de 0 a 3, para definir as novas posicoes dos carrinhos.
                n1 = rand()%4;
                n2 = rand()%4;
            }

            if(ponto1 == 2)
            {
                c2_cor = 0.0; // O Carrinho 2 muda de cor ao ser atingido.
                srand(time(NULL));
                // Gera numeros aleatorios de 0 a 3, para definir as novas posicoes dos carrinhos.
                n1 = rand()%4;
                n2 = rand()%4;
            }

            if(ponto1 == 3)   // No terceiro ponto, depois de um tempo, inicia uma nova partida.
            {
                glutTimerFunc(1000, tempo, 0.1);
                glutTimerFunc(1000, tempo, 0.1);
                nova_rodada();
            }
        }
    }
    else
    {
        bola1 = false;  // Sai da condicao de tiro.
        Tempo = 0;
        vez_jogada();   // Alterna jogada.
    }
}

void tiro_2()
{
    float Voy = Velocidade_2 * sin((angulo_2)/180.0 * PI),
          Vox = Velocidade_2 * cos((angulo_2)/180.0 * PI),

          x = Vox * Tempo,
          y = Voy * Tempo - G * Tempo * Tempo / 2,

          posicao_x = 0.0 + x,
          posicao_y = 2.0 + y; // Posicao (x,y) do projetil.

    if(bola2 == true)
    {
        // Mostra a trajetoria do projetil durante o tiro.
        trajetoria_balistica_2();
    }

    // Limites para +x, -x e -y para a posicao do projetil.
    if(posicao_x >= -400.00 && posicao_y >= -50.00 && posicao_x <= 400.00)
    {
        glTranslatef(posicao_x, posicao_y, 0.0);
        bomba();
        glutTimerFunc(30, tempo, 0);
        printf("\n C1_1: %.2f, x+C2_1: %.2f\n C1_3: %.2f, x+C2_3: %.2f\n",c1_1,posicao_x+c2_1,c1_3,posicao_x+c2_3);
        printf("\n C2_1: %.2f\n C2_3: %.2f\n",c2_1,c2_3);

        if(((posicao_x+c2_1 >= c1_1-2.5 && posicao_x+c2_1 <= c1_1+2.5)||(posicao_x+c2_3 >= c1_3-2.5 && posicao_x+c2_3 <= c1_3+2.5))
                && (posicao_y+c2_2 >= c1_2-3.5 && posicao_y+c2_2 <= c1_2+3.5))
        {
            colisao2 = true;
            ponto2++;   // Pontuacao para alterar a cor do carrinho.
            ponto_2++;  // Pontuacao para mostrar na tela.
            bola2 = false;  // Sai da condicao de tiro.
            Tempo = 0;
            vez_jogada();    // Alterna jogada.

            if(ponto2 == 1)
            {
                c1_cor = 0.5; // O Carrinho 1 muda de cor ao ser atingido.
                srand(time(NULL));
                // Gera numeros aleatorios de 0 a 3, para definir as novas posicoes dos carrinhos.
                n1 = rand()%4;
                n2 = rand()%4;
            }

            if(ponto2 == 2)
            {
                c1_cor = 0.0; // O Carrinho 1 muda de cor ao ser atingido.
                srand(time(NULL));
                // Gera numeros aleatorios de 0 a 3, para definir as novas posicoes dos carrinhos.
                n1 = rand()%4;
                n2 = rand()%4;
            }

            if(ponto2 == 3)   // No terceiro ponto, depois de um tempo, inicia uma nova partida.
            {
                glutTimerFunc(1000, tempo, 0.1);
                glutTimerFunc(1000, tempo, 0.1);
                nova_rodada();
            }
        }
    }
    else
    {
        bola2 = false;  // Sai da condicao de tiro.
        Tempo = 0;
        vez_jogada();   // Alterna jogada.
    }
}

void trajetoria_balistica_1()
{
    float Voy = Velocidade_1 * sin((angulo_1+2)/180.0 * PI),
          Vox = Velocidade_1 * cos((angulo_1+2)/180.0 * PI),

          tempo = 0.0, X = 0.0, Y = 2.0;

    glBegin(GL_LINE_STRIP);
    while(tempo <= 4 * (Voy * 2 / G))   // Desenha a linha da trajetoria, ate um dado tempo.
    {
        glVertex2f(X + Vox * tempo, Y + Voy * tempo - G * tempo * tempo / 2);
        tempo += 0.1;
    }
    glEnd();
}

void trajetoria_balistica_2()
{
    float Voy = Velocidade_2 * sin((angulo_2+2)/180.0 * PI),
          Vox = Velocidade_2 * cos((angulo_2+2)/180.0 * PI),

          tempo = 0.0, X = 0.0, Y = 2.0;

    glBegin(GL_LINE_STRIP);
    while(tempo <= 4 * (Voy * 2 / G))   // Desenha a linha da trajetoria, ate um dado tempo.
    {
        glVertex2f(X + Vox * tempo, Y + Voy * tempo - G * tempo * tempo / 2);
        tempo += 0.1;
    }
    glEnd();
}

//------------------ Funcoes para imprimir o texto na tela. ------------------
void renderbitmap(float x, float y, void *font, char* string)
{
    char *c;
    glRasterPos2f(x, y);
    for(c=string; *c != '\0'; c++)
    {
        glutBitmapCharacter(font, *c);
    }
}

void texto()
{
    char buf[100] = {0};

    if(jogada%2 == 0) // Se a jogada for par, e a vez do Player 1.
    {
        glColor3f(0.0f, 1.0f, 1.0f);
        sprintf(buf,"Velocidade: %d m/s, Angulo 1: %d", Velocidade_1, angulo_1);
        renderbitmap(-7.2,4.7,GLUT_BITMAP_HELVETICA_18, buf);
    }
    // Controles do Player 1.
    sprintf(buf,"(PLAYER 1)");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.2,4.4,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ VELOCIDADE:    W");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,4.2,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- VELOCIDADE:    S");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,4.0,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ ANGULO 1:         D");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,3.8,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- ANGULO 1:         A");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,3.6,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ ANGULO 2:         Q");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,3.4,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- ANGULO 2:         E");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,3.2,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"ATIRAR:                  F");
    glColor3f(0.0f, 1.0f, 1.0f);
    renderbitmap(-7.4,3.0,GLUT_BITMAP_HELVETICA_10, buf);

    sprintf(buf,"CAMERA:           c ou C");
    glColor3f(0.8f, 0.8f, 0.8f);
    renderbitmap(-7.4,2.6,GLUT_BITMAP_HELVETICA_10, buf);

    sprintf(buf,"NOVO JOGO:         B");
    glColor3f(0.8f, 0.8f, 0.8f);
    renderbitmap(-7.4,2.4,GLUT_BITMAP_HELVETICA_10, buf);

    sprintf(buf,"SAIR:                      Q");
    glColor3f(0.8f, 0.8f, 0.8f);
    renderbitmap(-7.4,2.2,GLUT_BITMAP_HELVETICA_10, buf);

    if(jogada%2 != 0)   // Se a jogada for impar, e a vez do Player 2.
    {
        glColor3f(0.5,0.0,0.0);
        sprintf(buf,"Velocidade: %d m/s, Angulo 1: %d", Velocidade_2, angulo_2);
        renderbitmap(-7.2,4.7,GLUT_BITMAP_HELVETICA_18, buf);
    }

    // Controles do Player 2.
    sprintf(buf,"(PLAYER 2)");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-4.8,4.4,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ VELOCIDADE:    I");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-5,4.2,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- VELOCIDADE:    K");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-5,4.0,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ ANGULO 1:         J");
    glColor3f(0.5,0.0,0.0);;
    renderbitmap(-5,3.8,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- ANGULO 1:         L");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-5,3.6,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"+ ANGULO 2:         U");
    glColor3f(0.5,0.0,0.0);;
    renderbitmap(-5,3.4,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"- ANGULO 2:         O");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-5,3.2,GLUT_BITMAP_HELVETICA_10, buf);
    sprintf(buf,"ATIRAR:                  H");
    glColor3f(0.5,0.0,0.0);
    renderbitmap(-5,3.0,GLUT_BITMAP_HELVETICA_10, buf);


    // Informacoes da partida.
    sprintf(buf,"RODADA %d   (PLAYER 1) %d x %d (PLAYER 2)", rodada+1, ponto_1,ponto_2);
    glColor3f(0.0f, 0.0f, 0.0f);
    renderbitmap(-2.5,4.7,GLUT_BITMAP_HELVETICA_18, buf);

    sprintf(buf,"*O primeiro a marcar 3 pontos, ganha a rodada.");
    glColor3f(0.0f, 0.0f, 0.0f);
    renderbitmap(-2.5,4.5,GLUT_BITMAP_HELVETICA_10, buf);
}

int main(int argc, char *argv[])
{
    srand(time(NULL));
    // Gera numeros aleatorios de 0 a 3, para definir as posicoes dos carrinhos.
    n1 = rand()%4;
    n2 = rand()%4;

    glutInit(&argc,argv);
    glutInitDisplayMode(GLUT_DEPTH | GLUT_RGB);
    glutInitWindowPosition(10,10);
    glutInitWindowSize(1200,800);
    glutCreateWindow("BU3D");
    glutDisplayFunc(Atualiza_Desenho);
    glutReshapeFunc(Atualiza_Tamanho);
    glutKeyboardFunc(LeTeclado);

    // Numeros aleatorios de 0 a 3, para definir a cor do fundo.
    numero_aleatorio = rand()%3;

    if(numero_aleatorio == 0)   // Se o numero e 0, o fundo e verde.
    {
        r = 0.0;
        g = 0.5;
        b = 0.5;
    }
    if(numero_aleatorio == 1)   // Se o numero e 1, o fundo e roxo.
    {
        r = 0.5;
        g = 0.5;
        b = 1.0;
    }
    if(numero_aleatorio == 2)   // Se o numero e 2, o fundo e amarelo.
    {
        r = 0.5;
        g = 0.5;
        b = 0.0;
    }
    glClearColor(1.5,0.5,0.5,0);

    glEnable(GL_DEPTH_TEST);
    glutMainLoop();
    return 0;
}
