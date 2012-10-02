// g++ /home/alon/Dev/emscripten/tests/enet_client.c -I/home/alon/Dev/emscripten/system/include/emscripten/ -Iinclude/ -fpermissive .libs/libenet.a -o enet_client

#include <emscripten.h>

#include <enet/enet.h>

ENetHost * host;

void main_loop() {
  printf("loop!\n");
  ENetEvent event;
  if (enet_host_service (host, & event, 1000) == 0) return;
  switch (event.type)
  {
    case ENET_EVENT_TYPE_CONNECT:
      printf ("Connection succeeded\n");

      break;
    case ENET_EVENT_TYPE_RECEIVE:
      printf ("A packet of length %u containing %s was received from %s on channel %u.\n",
              event.packet -> dataLength,
              event.packet -> data,
              event.peer -> data,
              event.channelID);
      /* Clean up the packet now that we're done using it. */
      enet_packet_destroy (event.packet);
      break;
    case ENET_EVENT_TYPE_DISCONNECT:
      printf ("%s disconected.\n", event.peer -> data);
      /* Reset the peer's client information. */
      event.peer -> data = NULL;
      enet_host_destroy(host);
    default:
      printf("whaaa? %d\n", event.type);
  }
}

int main (int argc, char ** argv)
{
  if (enet_initialize () != 0)
  {
    fprintf (stderr, "An error occurred while initializing ENet.\n");
    return EXIT_FAILURE;
  }
  atexit (enet_deinitialize);

  printf("creating host\n");

  host = enet_host_create (NULL /* create a client host */,
                              1 /* only allow 1 outgoing connection */,
                              2 /* allow up 2 channels to be used, 0 and 1 */,
                              57600 / 8 /* 56K modem with 56 Kbps downstream bandwidth */,
                              14400 / 8 /* 56K modem with 14 Kbps upstream bandwidth */);
  if (host == NULL)
  {
    fprintf (stderr,
              "An error occurred while trying to create an ENet client host.\n");
    exit (EXIT_FAILURE);
  }

  /* Connect to some.server.net:1234. */
  ENetAddress address;
  enet_address_set_host (& address, "localhost");
  address.port = 1234;

  printf("connecting to server...\n");

  ENetPeer *peer = enet_host_connect (host, & address, 2, 0);

  if (peer == NULL)
  {
    fprintf (stderr,
    "No available peers for initiating an ENet connection.\n");
    exit (EXIT_FAILURE);
  }
  /* Wait up to 5 seconds for the connection attempt to succeed. */
  ENetEvent event;
  if (enet_host_service (host, & event, 5000) > 0 &&
      event.type == ENET_EVENT_TYPE_CONNECT)
  {
    puts ("Connection to some.server.net:1234 succeeded.");
  }
  else
  {
    enet_peer_reset (peer);
    puts ("Connection to some.server.net:1234 failed.");
    return 0;
  }

  emscripten_set_main_loop(main_loop, 0);

  return 1;
}

