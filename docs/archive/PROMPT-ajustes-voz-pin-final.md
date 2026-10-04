# Ajustes: voz desde o início, pin em destaque, loader no modo texto e vídeo no final

Execute tudo de ponta a ponta e publique no final (seção 6). Estas regras substituem as anteriores sobre o início da voz, o botão no modo texto e a última etapa.

## 1. Voz começando já no início

O onboarding começa no **modo com voz**, falando na etapa 1 assim que o tooltip entra.

Os navegadores bloqueiam qualquer som antes do primeiro clique do usuário, e isso não tem como ser contornado por código. Implemente assim:

- Tente `audio.play()` na etapa 1. Se tocar, siga normalmente.
- Se for **bloqueado**, mostre antes da etapa 1 um **convite de início** curto: o Nexo já em cena, com um botão "Começar" (e um texto pequeno como "Ative o som para ouvir o Nexo"). O clique nesse botão libera o áudio, e a etapa 1 entra **já falando**, com o grifo e a borda de progresso.
- Use o mesmo visual dos tooltips do Figma para esse convite (fundo escuro, botão branco). Ele não conta como etapa: as bolinhas continuam em 9.
- Remova o modo "armado" (texto esperando o primeiro clique em qualquer lugar). O convite substitui esse comportamento.
- Se mesmo depois do clique o `play()` falhar, a etapa segue no modo texto, sem quebrar o fluxo.

## 2. Pin da etapa 3 com muito mais destaque

O usuário precisa perceber na hora que deve clicar no pin.

- Aumente o pin para ~1,8× o tamanho original e dê a ele uma **cor de destaque forte** (laranja do Nexo ou a cor de ação do Figma), com contorno branco para se separar do card.
- **Pulso mais forte e mais frequente:** dois anéis luminosos expandindo em sequência a cada ~0,9 s, chegando a ~2,2× o tamanho do pin, mais um leve salto do pin a cada ciclo.
- Um **halo suave** pulsando no card inteiro do Conversas, para o olhar ir até ele.
- O mini tooltip "Fixar no menu" fica sempre visível, com uma seta apontando para o pin e um leve balanço horizontal a cada ~2 s.
- O cursor animado dentro do modal continua mostrando o clique no pin.
- O pulso começa assim que o tooltip entra e só para quando o usuário clica.
- Com `prefers-reduced-motion`, sem animação, mas mantendo o tamanho, a cor e o anel estático.

## 3. Modo texto com loader e botão bloqueado

O modo texto passa a funcionar como o de voz quanto ao botão, só que **sem avançar sozinho**:

- O "Próximo" mostra a **mesma borda de progresso** do modo com voz e fica **desativado** enquanto ela enche.
- O tempo de preenchimento é igual à **duração do áudio daquela etapa** (do `voiceManifest.json`). Deixe um fator configurável (`TEXT_MODE_TIMER_FACTOR`, padrão 1,0) para ajustar depois.
- Quando completa, o botão é **ativado** e o usuário clica para seguir. **Não há avanço automático** no modo texto.
- Pausar a voz no meio da etapa leva ao modo texto: o áudio para, o texto fica todo branco, e a borda **continua de onde estava**, no ritmo do modo texto, até completar e ativar o botão.
- Na etapa 3 (pin) continua sem botão "Próximo"; o avanço é só pelo pin.
- O mesmo vale para o clique no alvo (ícones das etapas 1, 4 e 5): só funciona depois que a borda completa, nos dois modos.

## 4. Vídeo do Waz e do Nexo de volta na última etapa

A última etapa ("O Waz vai te ajudar a seguir daqui em diante! Nos vemos em breve.") continua **na Home**, com a linha do Waz destacada, mas o tooltip volta a ter o **vídeo do Waz com o Nexo** no topo.

**Arquivos do vídeo:** eles foram removidos do projeto antes. Restaure-os do histórico do git (`git log --all -- public/video/waz-nexo.mp4` para achar o último commit que os tinha, depois `git checkout <commit> -- public/video/waz-nexo.mp4 public/video/waz-nexo.webm public/video/waz-nexo-poster.jpg`). Se não encontrar, os arquivos estão no `nexo-video.zip` que vou colocar em `public/video/`.

**Tooltip:** o vídeo ocupa o topo do card, como antes (`autoplay muted loop playsinline`, WebM com MP4 como alternativa, capa enquanto carrega, caminhos pelo `import.meta.env.BASE_URL`, só a capa com `prefers-reduced-motion`). Abaixo, o texto, as bolinhas, "Voltar" e "Finalizar". Recalcule a posição do tooltip abaixo da linha do Waz com as regras de colisão que já existem.

**O Nexo 3D sai de cena:** como o vídeo já mostra o Nexo, ao entrar na última etapa o Nexo 3D **voa para dentro da área do vídeo**, encolhendo (1 → 0,3) e sumindo (opacidade 1 → 0) em ~700 ms, com o arco suave dos outros voos. O tooltip entra logo depois e o vídeo começa a tocar.
- Enquanto a etapa estiver aberta, o Nexo 3D fica invisível e parado (sem render, sem olhar para o mouse, sem flutuação).
- A voz da etapa toca normalmente, com o grifo e a borda, só sem a animação de boca.
- **Voltar** para a etapa anterior faz o caminho inverso: o Nexo sai da área do vídeo crescendo e aparecendo até a posição da etapa anterior.
- **Finalizar:** como o Nexo já saiu de cena, não há voo de saída; o tooltip e o overlay somem e a Home fica limpa, com a mensagem do Waz.
- Com `prefers-reduced-motion`, o Nexo só some com fade de 200 ms (e reaparece com fade ao voltar).

## 5. Testes
- Autoplay liberado: a etapa 1 já começa falando. Autoplay bloqueado: aparece o convite, e o clique em "Começar" faz a etapa 1 entrar falando.
- Etapa 3: o pin tem o destaque e o pulso novos; clicar avança em qualquer modo.
- Modo texto: borda presente, botão desativado até completar, ativado ao fim, nenhum avanço automático. Pausar no meio continua a borda de onde estava.
- Modo com voz: comportamento atual mantido (avanço automático ao fim da fala).
- Última etapa: vídeo tocando, Nexo 3D invisível e sem render; voltar traz o Nexo de volta; Finalizar deixa a Home limpa.

## 6. Publicar
Rode build, lint e testes. Faça commit com uma mensagem descritiva ("Voz desde o início, pin em destaque, loader no modo texto e vídeo no final"), dê push na `main`, acompanhe o workflow até terminar e confira no site publicado os quatro ajustes, sem erros no console e sem 404. Me mande o hash do commit, o status do workflow e prints da etapa 3, de uma etapa no modo texto e da última etapa.
