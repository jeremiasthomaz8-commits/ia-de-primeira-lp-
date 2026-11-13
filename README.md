# IA de Primeira — Workshop e Raio-X Empresarial

Landing page em português brasileiro, com HTML semântico, CSS responsivo e JavaScript modular. Usa a mesma base sem dependências do brandbook local, com os SVGs originais e dois pesos da Isidora Sans.

## Prévia local

Com Node.js 22 ou superior, execute `npm run dev` nesta pasta e abra [a página local](http://127.0.0.1:4180). Execute `npm run check` para verificar a sintaxe.

## Captura de interesse

O formulário mantém o envio indisponível até a configuração de um receptor. Configure as variáveis abaixo no servidor. Execute `npm start` para servir a página e a rota `/api/leads` na mesma origem.

| Variável | Uso |
| --- | --- |
| `LEAD_WEBHOOK_URL` | URL HTTPS do receptor autorizado a receber os dados. |
| `LEAD_WEBHOOK_TOKEN` | Token Bearer opcional. Fica no servidor. |
| `PRIVACY_POLICY_URL` | URL HTTPS da política oficial, exibida no formulário e no rodapé quando definida. |
| `HOST`, `PORT` | Interface e porta do servidor. O padrão local é `127.0.0.1:4180`. |

O receptor recebe um POST JSON com `nome`, `email`, `empresa`, `whatsapp` (formato internacional), `interesse`, `desafio`, `consentimento` e `consentimentoEm` (UTC). O campo `interesse` aceita `workshop`, `raio-x`, `ambos` ou uma string vazia. O receptor deve retornar um status 2xx após aceitar o registro. A página confirma o envio quando o servidor confirma essa resposta.

O servidor valida os campos, aplica limite de tamanho e de frequência e usa um campo invisível para reduzir spam. O limite de oito tentativas por dez minutos é por IP da conexão e por processo. Se houver proxy reverso, configure o controle de frequência no proxy para considerar o IP real de cada visitante. A aplicação encaminha os dados diretamente ao receptor e não os persiste.

A pasta `public/` também pode ser servida por hospedagem estática para revisão visual, com envio indisponível. O texto e as seções editáveis estão em `public/index.html`.
